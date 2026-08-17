/**
 * O cliente do SDK: fila, persistência e envio.
 *
 * O que faz: guarda os eventos capturados, persiste a fila para sobreviver a
 *            app fechado e a falta de rede, e envia em lote.
 * Implementa: épico 8.3 inteiro; regras 11.1 e 11.4; princípio 0.1.
 *
 * Princípio 0.1 levado a sério (assunção 21.8): este SDK **não envia nada
 * sozinho**. Não existe evento de instalação, de abertura de app nem de tela.
 * Só vai para o servidor o que o app pedir por `track`. A consequência aceita
 * é que a plataforma não sabe quantas pessoas abriram o app — para saber isso,
 * instrumenta-se um evento declarado, `app_aberto`, como qualquer outro.
 */

import type {
  EventoNaFila,
  InitOptions,
  ParametrosDaFila,
  StorageAdapter,
  TrackOptions,
} from "./types.js";
import { escolherStorage, estaEmReactNative } from "./storage.js";
import { enviarLote } from "./transport.js";
import { gerarId, motivoDoNomeInvalido, nomeDeEventoEhValido } from "./validation.js";

/** Host de produção da ingestão. */
const HOST_PADRAO = "https://glohvqzopiffdghwppor.supabase.co";

/** Defaults da tabela do épico 8.3. Não mude sem mudar o spec. */
export const PARAMETROS_PADRAO: ParametrosDaFila = {
  flushAt: 20,
  flushInterval: 10_000,
  maxBatchSize: 100,
  maxQueueSize: 1_000,
  retries: 3,
  retryDelay: 3_000,
  requestTimeout: 10_000,
};

export class Cliente {
  private readonly chave: string;
  private readonly projeto: string;
  private readonly host: string;
  private readonly storage: StorageAdapter;
  private readonly parametros: ParametrosDaFila;
  private readonly chaveDaFila: string;

  private fila: EventoNaFila[] = [];
  private distinctId: string | null = null;
  private propriedadesDePessoa: Record<string, unknown> | null = null;
  private cronometro: ReturnType<typeof setInterval> | null = null;
  private enviando: Promise<void> | null = null;
  private carregada: Promise<void>;

  constructor(opcoes: InitOptions) {
    this.chave = opcoes.key;
    this.projeto = opcoes.projeto;
    this.host = opcoes.host ?? HOST_PADRAO;
    this.storage = escolherStorage(opcoes.storage);
    this.parametros = { ...PARAMETROS_PADRAO, ...opcoes.fila };
    // Dois projetos no mesmo dispositivo não podem dividir a mesma fila.
    this.chaveDaFila = `visao.fila.${this.projeto}`;

    if (estaEmReactNative() && !opcoes.storage) {
      console.warn(
        "[visao] Sem storage configurado em React Native: a fila fica só na memória e " +
          "eventos capturados sem rede se perdem se o app fechar. Passe o AsyncStorage " +
          "em init({ storage }).",
      );
    }

    this.carregada = this.carregarFilaPersistida();
    this.iniciarCronometro();
  }

  /**
   * Recupera a fila deixada pela execução anterior.
   * É o que faz os 30 eventos capturados sem rede chegarem depois de o app ser
   * fechado e reaberto (critério do épico 8.3).
   */
  private async carregarFilaPersistida(): Promise<void> {
    try {
      const bruto = await this.storage.getItem(this.chaveDaFila);
      if (!bruto) return;
      const salvos = JSON.parse(bruto) as EventoNaFila[];
      if (Array.isArray(salvos)) {
        this.fila = salvos.concat(this.fila).slice(-this.parametros.maxQueueSize);
      }
    } catch {
      // Fila corrompida não pode impedir o app de subir.
    }
  }

  /** Grava a fila atual, para sobreviver ao fechamento do app. */
  private async persistirFila(): Promise<void> {
    try {
      if (this.fila.length === 0) {
        await this.storage.removeItem(this.chaveDaFila);
        return;
      }
      await this.storage.setItem(this.chaveDaFila, JSON.stringify(this.fila));
    } catch {
      // Sem espaço para persistir: a fila em memória continua valendo.
    }
  }

  /** Liga o envio automático a cada `flushInterval`. */
  private iniciarCronometro(): void {
    if (this.cronometro || this.parametros.flushInterval <= 0) return;
    this.cronometro = setInterval(() => {
      void this.flush();
    }, this.parametros.flushInterval);
    // Em Node, o timer não pode segurar o processo aberto.
    (this.cronometro as unknown as { unref?: () => void }).unref?.();
  }

  /**
   * Associa os eventos seguintes a um identificador de pessoa.
   * Recebe o `distinct_id` do app e, opcionalmente, propriedades da pessoa.
   * As propriedades viajam em `propriedades.pessoa` de cada evento, que é de
   * onde a trigger `fn_atualiza_pessoa` faz o merge.
   */
  identify(distinctId: string, propriedades?: Record<string, unknown>): void {
    if (!distinctId || distinctId.trim() === "") {
      console.warn("[visao] identify() recebeu um distinct_id vazio e foi ignorado.");
      return;
    }
    this.distinctId = distinctId;
    this.propriedadesDePessoa = propriedades ?? null;
  }

  /**
   * Enfileira um evento e devolve na hora, sem `await`.
   * Recebe o nome do evento e, no nível de cima, a descrição e a tela — os dois
   * campos que o princípio 0.2 torna de primeira classe. As propriedades livres
   * do app ficam aninhadas em `props`.
   *
   * O `id` e o `ocorrido_em` são carimbados aqui, no momento do `track`, e não
   * no do envio: é o que faz um evento capturado offline chegar com a hora em
   * que aconteceu de verdade.
   */
  track(nome: string, opcoes: TrackOptions = {}): void {
    if (!nomeDeEventoEhValido(nome)) {
      console.error(`[visao] evento não enviado — ${motivoDoNomeInvalido(nome)}`);
      return;
    }

    // Sem identificação não há evento: a v1 não tem fluxo anônimo, e inventar um
    // identificador aqui seria capturar algo que o app não declarou (princípio
    // 0.1). A resolução de identidade anônima é a v2 (F9).
    if (!this.distinctId) {
      console.error(
        `[visao] evento "${nome}" não enviado — chame identify(distinct_id) antes do primeiro track.`,
      );
      return;
    }

    const propriedades: Record<string, unknown> = { ...(opcoes.props ?? {}) };
    if (this.propriedadesDePessoa) {
      propriedades.pessoa = this.propriedadesDePessoa;
    }

    const evento: EventoNaFila = {
      id: gerarId(),
      nome,
      distinct_id: this.distinctId,
      ocorrido_em: new Date().toISOString(),
      ...(opcoes.tela ? { tela: opcoes.tela } : {}),
      ...(opcoes.descricao ? { descricao: opcoes.descricao } : {}),
      ...(Object.keys(propriedades).length > 0 ? { propriedades } : {}),
    };

    this.fila.push(evento);

    // Ao encher, descarta o mais antigo (tabela do épico 8.3).
    if (this.fila.length > this.parametros.maxQueueSize) {
      const descartados = this.fila.length - this.parametros.maxQueueSize;
      this.fila.splice(0, descartados);
      console.warn(
        `[visao] fila cheia (${this.parametros.maxQueueSize}): ${descartados} evento(s) mais antigo(s) descartado(s).`,
      );
    }

    void this.persistirFila();

    if (this.fila.length >= this.parametros.flushAt) {
      void this.flush();
    }
  }

  /**
   * Força o envio.
   * Devolve uma promessa que resolve quando a fila esvazia ou quando o retry se
   * esgota — o que vier primeiro. Chamadas simultâneas compartilham o mesmo
   * envio, para o mesmo evento não sair duas vezes.
   */
  async flush(): Promise<void> {
    if (this.enviando) return this.enviando;

    this.enviando = this.enviarTudo().finally(() => {
      this.enviando = null;
    });

    return this.enviando;
  }

  /** Manda a fila em lotes de até `maxBatchSize`, até esvaziar ou falhar. */
  private async enviarTudo(): Promise<void> {
    await this.carregada;

    while (this.fila.length > 0) {
      const lote = this.fila.slice(0, this.parametros.maxBatchSize);

      const resultado = await enviarLote(this.host, this.chave, lote, this.parametros);

      if (resultado.tipo === "falha_temporaria") {
        // O lote continua na fila e sai na próxima tentativa. Nada se perde.
        console.warn(`[visao] envio adiado — ${resultado.motivo}`);
        return;
      }

      if (resultado.tipo === "recusado") {
        console.error(
          `[visao] o servidor recusou ${lote.length} evento(s) (${resultado.status}): ${resultado.motivo}`,
        );
      }

      // Entregue ou recusado em definitivo: em ambos os casos o lote sai da
      // fila. Reenviar um lote recusado só o recusaria de novo.
      this.fila.splice(0, lote.length);
      await this.persistirFila();
    }
  }

  /** Para o envio automático. Usado nos testes e ao desmontar o app. */
  async encerrar(): Promise<void> {
    if (this.cronometro) {
      clearInterval(this.cronometro);
      this.cronometro = null;
    }
    await this.flush();
  }

  /** Quantos eventos estão esperando. Existe para teste e diagnóstico. */
  get tamanhoDaFila(): number {
    return this.fila.length;
  }
}
