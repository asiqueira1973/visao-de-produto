# Prompt de implementação — Visão de Produto

Cole o bloco abaixo no Claude Code, dentro da pasta `Visao de Produto`.
Vale para a **primeira sessão**. Nas sessões seguintes, use o prompt curto no fim deste arquivo.

---

```
Você vai implementar o "Visão de Produto", uma plataforma de product analytics.

COMO EU TRABALHO — leia isto primeiro
Eu não uso terminal. Não sei rodar comando, não tenho console aberto, e não vou
executar nada por fora. Você executa tudo: git, instalação de dependências,
migrations, build, deploy. Nunca me diga "rode tal comando" — rode você e me
conte o que aconteceu. Se algum passo exigir interação minha que você não pode
fazer (autenticar no navegador, colar um código, clicar em algo num painel
web), pare, me diga em uma frase exatamente o que eu preciso clicar ou colar, e
espere. Não presuma que eu resolvi por fora.

ARQUIVOS DESTE PROJETO — leia por completo antes de qualquer coisa, nesta ordem:
  1. spec.md                                — fonte única de verdade
  2. modelo-visao-de-produto.dbml           — modelo de dados (espelha a seção 7)
  3. visao de produto-telas claude design/  — referência visual (leia o HTML,
                                              não abra no navegador)

────────────────────────────────────────────────────────
PRECEDÊNCIA (seção 4.4 do spec, e é absoluta)
────────────────────────────────────────────────────────
As telas prevalecem em layout, espaçamento, hierarquia, paleta, tipografia,
densidade e estados de UI.
O spec.md prevalece em comportamento, conteúdo, contrato de API, nome de função,
assinatura de SDK, texto de snippet, modelo de dados e regra de negócio.
Onde divergirem no segundo grupo, siga o spec e registre a divergência no
DOCUMENTACAO-TECNICA.md. Não decida sozinho qual ganha — a regra já está dada.

────────────────────────────────────────────────────────
REPOSITÓRIO E TRABALHO EM DUAS MÁQUINAS
────────────────────────────────────────────────────────
Eu trabalho em dois computadores diferentes (desktop de casa e laptop) e nunca
fiz isso antes. Você é responsável por manter os dois em sincronia. Eu não vou
lembrar de pedir — é obrigação sua, todo dia.

NO INÍCIO DE TODA SESSÃO, antes de qualquer outra coisa:
  1. Verifique se esta pasta já é um repositório git.
  2. Se JÁ FOR: rode `git pull` e me diga em uma linha o que veio (ou "nada novo").
     Se houver conflito, resolva você e me explique o que mudou.
     Se houver trabalho não commitado da sessão anterior, me avise antes de mexer.
  3. Se NÃO FOR: faça a configuração inicial descrita abaixo.

CONFIGURAÇÃO INICIAL DO REPOSITÓRIO (só na primeira vez):
  a) `git init -b main`
  b) Crie o .gitignore com, no mínimo:
        node_modules/
        .next/
        dist/
        .turbo/
        .env
        .env.local
        .env*.local
        .DS_Store
        _to_delete/
     Se a pasta `_to_delete/` existir, ela contém lixo meu — ignore, não commite.
  c) Crie um `.env.example` com TODAS as variáveis da seção 15.5 do spec, com os
     valores vazios. Este arquivo VAI para o git; o `.env` real NUNCA vai.
  d) `git add .` e commit inicial com mensagem descritiva.
  e) Crie o repositório remoto PRIVADO no GitHub e faça o push:
        gh repo create visao-de-produto --private --source=. --push
     Se o `gh` não estiver autenticado, ele vai pedir login pelo navegador —
     nesse caso me diga exatamente o código que eu preciso colar e o endereço
     que preciso abrir, e espere eu confirmar.
  f) Me confirme a URL do repositório quando terminar.

AO FIM DE CADA ÉPICO, e sempre que eu disser que vou parar:
  1. Atualize CLAUDE.md e DOCUMENTACAO-TECNICA.md com o que mudou.
  2. `git add -A`, commit com mensagem descritiva em português, `git push`.
  3. Me confirme em uma linha que está tudo sincronizado.
  Commit trabalho pela metade sem problema — use prefixo `wip:` na mensagem.
  O que não pode é eu trocar de máquina com coisa não enviada.

SEGREDOS — regra dura:
  Nenhuma chave, token, senha ou string de conexão real entra em arquivo
  versionado. Elas vivem só no `.env` local, que está no .gitignore. Antes de
  todo push, verifique que nenhum segredo vazou para código, README, comentário,
  arquivo de exemplo ou mensagem de commit. Se eu colar uma chave no chat, use-a
  e não a escreva em lugar nenhum além do `.env`.

SE EU DISSER QUE ESTOU NUMA MÁQUINA NOVA:
  Clone o repositório, instale as dependências, e crie o `.env` a partir do
  `.env.example` — me pedindo os valores que faltarem, um a um, dizendo onde eu
  acho cada um (painel do Supabase, etc.). O banco é Supabase na nuvem, então os
  dados são os mesmos; só o ambiente local precisa ser remontado.
  Não rode migration nova sem antes checar o estado do banco remoto.

────────────────────────────────────────────────────────
ANTES DE ESCREVER CÓDIGO
────────────────────────────────────────────────────────
1. Leia a seção 21 (Assunções declaradas) e a 22 (Perguntas abertas).
   Diante de qualquer item da 22, PERGUNTE — não assuma.
   A assunção 21.8 é a mais importante do documento: leia com atenção e me
   confirme antes do épico 8.3.
2. Monte o plano e a lista de tarefas e me mostre para aprovação.
   Não comece a implementar sem meu ok.
3. Crie o projeto no Supabase JÁ NO PLANO PRO (risco R4 — o plano free tem
   500 MB e pausa o projeto após uma semana de inatividade, o que significa
   evento perdido). Habilite o provedor Google no Supabase Auth antes do 8.1.

────────────────────────────────────────────────────────
ORDEM DE IMPLEMENTAÇÃO — épicos da seção 8, sem pular
────────────────────────────────────────────────────────
  8.1 banco, RLS, particionamento e triggers   ← primeiro, sempre
  8.2 endpoint de ingestão
  8.3 SDK JavaScript/TypeScript
  8.4 site: projetos, atividade, detalhe do evento
  8.5 site: uso, painel, pessoas
  8.6 servidor MCP
  8.7 CLI de inicialização e skills
Valide cada épico contra TODOS os seus critérios de aceite antes de seguir.
Critério não verificado é épico não concluído. Commit e push ao fim de cada um.

────────────────────────────────────────────────────────
FORA DE ESCOPO — não implemente nada da seção 25 (Roadmap)
────────────────────────────────────────────────────────
Stripe e cobrança (F10), convite de membros (F4), cobertura contra a spec (F8),
SDKs Flutter e Python (F5), resolução de identidade (F9), resumo semanal (F7).
ATENÇÃO: multi-tenancy NÃO está fora de escopo. As tabelas `contas`,
`usuarios_conta` e `uso_mensal`, a coluna `conta_id` e as políticas de RLS com
predicado de propriedade entram na v1 (itens D8 e D10). A exportação de dados
(D11) também. Se algo parecer precisar de item do roadmap, pergunte.

────────────────────────────────────────────────────────
REGRAS DE DESEMPATE
────────────────────────────────────────────────────────
Os princípios da seção 0, em especial:
  0.1 — nada entra que não foi declarado (sem autocapture, sem geo, sem IP)
  0.4 — simplicidade antes de complexidade prematura
  0.6 — autosserviço: nenhum caminho pode exigir intervenção do dono

────────────────────────────────────────────────────────
CONVENÇÕES OBRIGATÓRIAS
────────────────────────────────────────────────────────
- Banco em PORTUGUÊS, snake_case, com os nomes exatos das seções 7 e 7.10.
- Código, variáveis e nomes de arquivo em inglês. A fronteira de idioma fica na
  camada de acesso a dados.
- TODA função, hook, rota, trigger e política leva comentário de cabeçalho em
  português dizendo o que faz, o que recebe, o que devolve e qual regra do spec
  implementa, com o número da seção. Lógica não óbvia leva comentário inline.
- Use os tokens de cor da seção 13.2 literalmente. Não escolha cor nenhuma.
- Siga literalmente as tabelas das seções 11 (regras de negócio) e 5.1
  (credenciais). Não invente valor, limite, formato nem permissão.
- RLS com predicado de propriedade real em todas as tabelas. Nunca `using(true)`.
- Rode `get_advisors` (segurança E performance) do Supabase após toda DDL, e me
  reporte o resultado.

────────────────────────────────────────────────────────
AO FINAL
────────────────────────────────────────────────────────
Gere DOCUMENTACAO-TECNICA.md com os seis itens da seção 16, escrito a partir do
que foi REALMENTE implementado, incluindo a seção de divergências.
Gere CLAUDE.md e README.md conforme a seção 15.4. O CLAUDE.md precisa incluir,
além das convenções: a rotina de git descrita acima, para que sessões futuras
(inclusive na outra máquina) a sigam sem eu precisar repetir.
Confira o Definition of Done (seção 23) item a item e me mostre o resultado.
Commit e push de tudo.
```

---

## Prompt curto — para as sessões seguintes

Cole isto no começo de toda sessão nova, inclusive quando trocar de máquina:

```
Continuando o projeto Visão de Produto. Eu não uso terminal — você executa tudo.

1. Leia CLAUDE.md e DOCUMENTACAO-TECNICA.md.
2. Rode `git pull` e me diga em uma linha o que veio. Se eu estiver numa máquina
   nova, clone o repositório, instale as dependências e monte o `.env` a partir
   do `.env.example`, me pedindo os valores que faltarem.
3. Me diga em qual épico do spec.md nós paramos e qual é o próximo passo.
4. Aguarde meu ok antes de implementar.

Ao fim da sessão, ou quando eu disser que vou parar: atualize CLAUDE.md e
DOCUMENTACAO-TECNICA.md, faça commit e push, e me confirme que está sincronizado.
```
