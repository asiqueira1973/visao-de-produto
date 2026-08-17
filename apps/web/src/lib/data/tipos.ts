/**
 * Tipos que espelham o banco.
 *
 * Os nomes de campo ficam em português porque é assim que eles existem no
 * Postgres e viajam no contrato — a fronteira de idioma é a camada de acesso a
 * dados (convenção 15.1). O resto do código é em inglês.
 */

/** Linha de `projetos` (seção 7.3). */
export interface Projeto {
  id: string;
  conta_id: string;
  nome: string;
  slug: string;
  descricao: string | null;
  prefixo_evento: string | null;
  fuso_exibicao: string;
  criado_em: string;
  arquivado_em: string | null;
}

/** Retorno de `fn_resumo_projetos` — a tela de Projetos (épico 8.4). */
export interface ResumoDeProjeto {
  id: string;
  nome: string;
  slug: string;
  descricao: string | null;
  fuso_exibicao: string;
  eventos_24h: number;
  ultimo_evento_em: string | null;
}

/** Retorno de `fn_atividade` — a tela de Atividade (épico 8.4). */
export interface EventoDaAtividade {
  id: string;
  nome: string;
  descricao: string | null;
  distinct_id: string;
  tela: string | null;
  propriedades: Record<string, unknown>;
  ocorrido_em: string;
  recebido_em: string;
}

/** Linha de `definicoes_evento` (seção 7.5). */
export interface DefinicaoDeEvento {
  id: string;
  projeto_id: string;
  nome: string;
  descricao: string | null;
  telas: string[];
  total_ocorrencias: number;
  primeira_ocorrencia_em: string | null;
  ultima_ocorrencia_em: string | null;
}

/** Linha de `credenciais` (seção 7.8). O valor em claro nunca aparece aqui. */
export interface Credencial {
  id: string;
  tipo: "ingestao" | "leitura";
  projeto_id: string | null;
  nome: string;
  prefixo: string;
  criada_em: string;
  ultimo_uso_em: string | null;
  revogada_em: string | null;
}
