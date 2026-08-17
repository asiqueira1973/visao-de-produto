# Prompt de design — Visão de Produto

Cole o bloco abaixo no Claude Design para gerar todas as telas.
Gerado a partir das seções 10 (Inventário de telas), 13 (Direção visual), 8 (Épicos) e 5 (Credenciais) do `spec.md` v1.0.

---

```
Desenhe a interface completa de uma plataforma de product analytics deliberadamente
pequena, chamada "Visão de Produto". É um painel web (back-office),
usado por uma única pessoa — o desenvolvedor dono dos aplicativos monitorados.

CONTEXTO DO PRODUTO
Aplicativos enviam eventos de uso por uma API. A plataforma armazena e mostra o que
está sendo usado. O diferencial é o que ela NÃO faz: sem funil, sem retenção, sem
coorte, sem session replay, sem feature flags, sem geolocalização, sem métrica de
marketing. Três perguntas apenas: "alguém está usando isso?", "quem usou o quê?",
"o que aconteceu hoje?".

Dois princípios que precisam ser visíveis no desenho:
1. Nada é capturado automaticamente. Só existe o que o app enviou de propósito.
   A tela de detalhe do evento mostra 4 ou 5 campos, nunca 18. Isso é a diferença
   central em relação às ferramentas concorrentes e o desenho deve deixá-la evidente.
2. Todo evento carrega uma descrição em português explicando o que significa. A
   descrição aparece SEMPRE junto do nome técnico do evento, em toda tela. O nome
   técnico (psi_novo_pagamento) é secundário; a descrição ("usuário registrou um
   pagamento de um paciente") é o que se lê primeiro.

VOLUME REAL: baixo. Dezenas de eventos por dia, poucas dezenas de usuários por app.
O desenho precisa ficar bom com números pequenos — 3 usuários, 12 eventos — e não
parecer quebrado ou vazio. Números pequenos são o caso normal, não o estado de erro.

────────────────────────────────────────────────────────────
NAVEGAÇÃO — menu lateral persistente, estilo App Store Connect
────────────────────────────────────────────────────────────

- Grupos com título em negrito escuro, caixa normal. NUNCA maiúsculas decorativas.
- Itens indentados sob o grupo, SEM marcador, bolinha ou ícone de lista.
- Traço fino (hairline) separando os grupos.
- Um único item ativo por vez: texto na cor primária + pílula clara da mesma cor
  ao fundo. Nenhum outro item recebe destaque.
- Rodapé com e-mail do usuário e a ação "Sair"; ao lado, um selo discreto de
  ambiente quando não for produção.
- Cantos arredondados suaves, hairlines em vez de bordas pesadas, espaçamento
  generoso.

Estrutura exata do menu:

  Projetos                    (grupo)
    Agenda Psi
    Swim
    Portal BBZ
  ──────────────────────────
  Agenda Psi                  (grupo — nome do projeto ativo)
    Atividade
    Uso
    Painel
    Pessoas
    Catálogo
    Configurações
  ──────────────────────────
  Conta                       (grupo)
    Credenciais MCP
  ──────────────────────────
  [rodapé] alexandre@dablab.com.br · Sair

────────────────────────────────────────────────────────────
DIREÇÃO VISUAL
────────────────────────────────────────────────────────────

Referências: Linear (densidade e tipografia), painel do Vercel (calma, hairlines).
Tipografia: Inter na interface; JetBrains Mono para nomes de evento, chaves de API
e JSON.
Modo escuro é o PADRÃO. Entregue também a versão clara.
Cor primária: escolha uma que não colida com as semânticas abaixo.
Cores semânticas, reservadas exclusivamente para significado, nunca decoração:
  verde   = evento com ocorrências no período
  cinza   = evento sem nenhuma ocorrência no período (inativo)
  vermelho = erro e credencial revogada
Densidade: tabela densa, altura de linha compacta. A tela de Atividade é feita
para varrer com o olho, não para contemplar.

────────────────────────────────────────────────────────────
TELAS
────────────────────────────────────────────────────────────

[Todas as telas exigem sessão iniciada. Só há um perfil de usuário — o dono — que
pode tudo. Não desenhe estados de permissão negada, exceto onde indicado.]

1. LOGIN
   E-mail e senha. Sem "criar conta", sem "esqueci minha senha" — decisão de produto,
   há um único usuário. Estado de erro: credencial inválida.

2. PROJETOS
   Lista dos aplicativos monitorados. Por projeto: nome, total de eventos nas
   últimas 24 h, horário do último evento recebido.
   Ações: criar projeto, abrir, arquivar.
   Estado vazio: nenhum projeto ainda — mostre o comando de inicialização
   (npx <produto> init) como o caminho principal, não um botão "criar".

3. ATIVIDADE  [tela principal do produto]
   Stream de eventos em ordem decrescente de horário. Por linha:
   descrição em destaque, nome técnico do evento em fonte mono e menor,
   identificador da pessoa, tela de origem, horário relativo ("há 21 minutos").
   Separador de data entre eventos de dias diferentes.
   Filtros compostos: intervalo de data, nome do evento, pessoa.
   Rolagem infinita, 50 por página.
   Estados: carregando (skeleton de linhas, nunca spinner de tela cheia);
   vazio (projeto sem eventos — mostre o trecho de código de instrumentação e a
   chave de ingestão, não uma ilustração genérica); erro de carregamento.

4. DETALHE DO EVENTO
   Painel lateral (drawer) aberto ao clicar numa linha da Atividade.
   Mostra TODAS as propriedades do evento — que são poucas de propósito:
   nome, descrição, pessoa, tela, horário do dispositivo, horário de recebimento,
   e as propriedades declaradas pelo app em JSON formatado.
   Ações: copiar valor, filtrar a Atividade por esta pessoa.
   IMPORTANTE: esta tela é uma declaração de princípio. Ela deve parecer
   propositalmente enxuta. Não invente campos de metadado.

5. USO
   Tabela com TODOS os eventos do catálogo. Por linha: descrição, nome técnico,
   total no período, usuários únicos no período, data da última ocorrência.
   Seletor de período no topo: 7, 14, 30, 90 dias.
   REGRA CRÍTICA DE DESENHO: evento com ZERO ocorrências no período aparece na
   lista, com o zero explícito e marcação visual de inativo (cinza). Ele NUNCA é
   omitido — mostrar o zero é a razão de a tela existir.
   Ordenável por qualquer coluna. Clicar numa linha leva à Atividade filtrada.

6. PAINEL
   Grade de tiles configuráveis. Cada tile: título (ou a descrição do catálogo,
   quando não há título), a visualização, e SEMPRE o número absoluto do período
   junto do gráfico.
   REGRA CRÍTICA DE DESENHO: com menos de 30 ocorrências no período, use BARRAS,
   nunca linha suavizada. Curva interpolada sobre 1 ou 2 eventos comunica
   tendência onde só existe ruído. Desenhe o exemplo com números pequenos
   (1, 2, 5, 12 ocorrências) para provar que funciona nesse caso.
   Ações: adicionar tile (escolhendo do catálogo ou digitando um evento ainda não
   visto), remover, reordenar, trocar o período do painel inteiro.
   Estado especial: tile cujo evento nunca foi recebido exibe o aviso
   "este evento nunca foi recebido" em vez de um gráfico vazio.

7. PESSOAS
   Lista dos usuários do app: identificador, total de eventos, primeiro acesso,
   último acesso. Clicar abre a linha do tempo daquela pessoa — a sequência do
   que ela fez, com a descrição de cada evento.

8. CATÁLOGO
   Todos os eventos que o projeto já registrou: nome técnico, descrição EDITÁVEL
   na própria tela, telas onde já apareceu, total acumulado, primeira e última
   ocorrência.
   A edição da descrição é inline e é a ação principal desta tela — é aqui que o
   significado dos eventos é curado.
   Marque visualmente os eventos que não têm descrição: são o trabalho pendente.

9. CONFIGURAÇÕES DO PROJETO
   Nome, slug, prefixo de evento (ex.: psi_), fuso de exibição.
   Chave de ingestão: mostra apenas o prefixo (ing_a3f8…) e a data do último uso.
   Ações: gerar nova chave, revogar.
   Ao gerar, o valor completo aparece UMA ÚNICA VEZ, num bloco copiável com aviso
   claro de que não será mostrado de novo.
   Bloco de instalação: trecho de código pronto para copiar, com a chave já
   preenchida.

10. CREDENCIAIS MCP
    Tokens de leitura usados pelo Claude. Por linha: nome ("Claude Code do
    notebook"), prefixo (mcp_9d21…), data de criação, último uso.
    Ações: gerar token, revogar. Mesma regra de exibição única do valor.
    Inclua um bloco copiável com a configuração pronta do servidor MCP.

────────────────────────────────────────────────────────────
FLUXO ENTRE TELAS
────────────────────────────────────────────────────────────

Login → Projetos → [escolhe um projeto] → Atividade (tela padrão do projeto).
Dentro do projeto, o menu lateral navega livremente entre Atividade, Uso, Painel,
Pessoas, Catálogo e Configurações.
Atalhos entre telas: da Atividade abre-se o Detalhe do evento; do Uso vai-se para
a Atividade filtrada por aquele evento; do Detalhe filtra-se por aquela pessoa;
de Pessoas abre-se a linha do tempo individual.

────────────────────────────────────────────────────────────
COPY
────────────────────────────────────────────────────────────

Português do Brasil. Tom direto, sem entusiasmo de marketing, sem exclamação.
Mensagem de estado vazio nunca é decorativa: diz o que fazer em seguida.
Onde eu não especifiquei o texto exato, use placeholder claramente marcado
— por exemplo [placeholder: título da seção] — e não invente copy final.

ENTREGUE: as 10 telas em modo escuro e claro, nos estados normal, vazio,
carregando e de erro onde eles existem, com o menu lateral consistente em todas.
```
