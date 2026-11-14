/**
 * Esquemas de URL que executam código ou carregam conteúdo no navegador.
 * Nunca podem ser usados como redirect_uri de um cliente OAuth: o registro
 * os recusa (servidor.ts) e a tela de confirmação se recusa a navegar para
 * eles (ConfirmacaoDoOauth.tsx). Fica num arquivo próprio porque é usado
 * tanto no servidor quanto no componente de cliente.
 */
export const ESQUEMAS_PERIGOSOS = ["javascript:", "data:", "vbscript:", "file:", "blob:", "about:"];
