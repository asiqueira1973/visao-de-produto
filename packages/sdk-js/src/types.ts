/**
 * Tipos públicos do SDK.
 *
 * Os tipos que espelham o banco mantêm os nomes de campo em português, porque
 * é assim que eles viajam no contrato da seção 12.1 do spec. O resto do código
 * é em inglês (convenção 15.1).
 */

/** Guarda e devolve a fila entre execuções do app. */
export interface StorageAdapter {
  getItem(chave: string): Promise<string | null> | string | null;
  setItem(chave: string, valor: string): Promise<void> | void;
  removeItem(chave: string): Promise<void> | void;
}

/** Opções de `init` (épico 8.3). */
export interface InitOptions {
  /** Chave de ingestão do projeto, com prefixo `ing_`. */
  key: string;
  /**
   * Slug do projeto. O servidor resolve o projeto pela chave (regra 11.5) e
   * ignora este valor; ele existe para dar contexto às mensagens de erro e
   * para separar a fila persistida de dois projetos no mesmo dispositivo.
   */
  projeto: string;
  /** Host da ingestão. Default: a instância de produção. */
  host?: string;
  /**
   * Onde persistir a fila. Em navegador e em Node é detectado sozinho; em
   * React Native, passe o AsyncStorage do app aqui — o SDK não depende de
   * módulo nativo nenhum (critério do épico 8.3).
   */
  storage?: StorageAdapter;
  /** Sobrescreve os parâmetros de fila. Use só se souber por quê. */
  fila?: Partial<ParametrosDaFila>;
}

/** Parâmetros de fila e retry (tabela do épico 8.3). */
export interface ParametrosDaFila {
  /** Eventos na fila antes de enviar. */
  flushAt: number;
  /** Intervalo entre envios automáticos, em ms. */
  flushInterval: number;
  /** Máximo de eventos por request. */
  maxBatchSize: number;
  /** Ao encher, descarta o mais antigo. */
  maxQueueSize: number;
  /** Tentativas por lote. */
  retries: number;
  /** Intervalo fixo entre tentativas, em ms. */
  retryDelay: number;
  /** Tempo máximo de um request, em ms. */
  requestTimeout: number;
}

/** O que `track` aceita além do nome. */
export interface TrackOptions {
  /**
   * O que o evento significa, em português. Campo de primeira classe
   * (princípio 0.2) — não é uma propriedade solta.
   */
  descricao?: string;
  /** Onde aconteceu. Nulo em evento de backend, que não tem tela. */
  tela?: string;
  /** Propriedades livres do app. */
  props?: Record<string, unknown>;
}

/** Um evento na fila, no formato exato da seção 12.1. */
export interface EventoNaFila {
  id: string;
  nome: string;
  distinct_id: string;
  ocorrido_em: string;
  tela?: string;
  descricao?: string;
  propriedades?: Record<string, unknown>;
}

/** Resposta do endpoint de ingestão (seção 12.1). */
export interface RespostaDaIngestao {
  aceitos: number;
  duplicados: number;
  rejeitados: Array<{ id: string | null; campo: string; motivo: string }>;
}
