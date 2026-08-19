# Prompt para gerar o site institucional

Cole no Claude Design (ou equivalente). Ao final, anexe os prints das telas —
a lista do que capturar está na seção "Imagens que eu vou anexar".

Endereço final: **visaodeproduto.com.br** e **www.visaodeproduto.com.br**.
O aplicativo vive em `app.visaodeproduto.com.br` e **não** faz parte deste site.

---

## O prompt

Crie uma **landing page de página única**, em português do Brasil, para um produto
chamado **Visão de Produto**.

### O que é o produto, em uma frase

Uma plataforma de product analytics deliberadamente pequena, em que os aplicativos
enviam só os eventos que importam, e as respostas ficam disponíveis de duas formas
equivalentes: um painel na web e o **Claude**, respondendo em linguagem natural.

### Para quem é

Para quem constrói software com IA — sozinho ou em time pequeno, com o Claude Code, a
partir de specs — e entrega feature rápido **sem fazer ideia do que está sendo usado**.

É gente que não procura ferramenta de analytics, não compara tabela de preço, e desiste
no primeiro muro de onboarding: criar conta, criar organização, criar projeto, escolher
entre mil opções.

As perguntas desse público são três, e só três:

- *Alguém está usando isso?*
- *Quem usou, e o quê?*
- *O que aconteceu no app hoje?*

### As três ideias que o site precisa deixar grudadas

1. **Nada é capturado automaticamente.** Sem IP, sem geolocalização, sem user-agent, sem
   pageview implícito. Só existe lá o que o código enviou de propósito. É o contrário do
   padrão do mercado, e é deliberado.
2. **Todo evento carrega o que significa.** Cada evento tem uma descrição em português,
   tratada como campo de primeira classe. Seis meses depois, `crm_lead_qualificado`
   continua dizendo "vendedor marcou o lead como qualificado" — para você e para o agente.
3. **O evento que NÃO aconteceu aparece.** Com zero explícito. Você subiu uma feature na
   semana passada; a tela mostra que ela nunca foi usada. Essa é a pergunta que a
   plataforma existe para responder, e a que as outras ferramentas escondem.

### A estrutura da página, na ordem

1. **Topo.** Título grande e direto, uma frase de apoio, e um botão "Começar" que leva a
   `https://app.visaodeproduto.com.br`. Ao lado, a ilustração/print do painel.
   Sugestão de título: *"Você lançou. Alguém usou?"*
2. **O problema, em três linhas.** Times inteiros entregam feature toda semana e ninguém
   sabe qual tela é usada. Não é falta de ferramenta — é que nenhuma delas foi feita para
   quem não procura ferramenta.
3. **As três ideias acima**, cada uma como um bloco com título curto e duas ou três
   linhas. Use os prints como apoio.
4. **Como funciona, em três passos** — este é o coração da página:
   - **1. O agente instrumenta enquanto constrói.** Ao implementar uma tela nova, o Claude
     adiciona a chamada de evento no código, seguindo a convenção que o projeto já usa e
     escrevendo a descrição em português.
   - **2. O app envia — pelo SDK ou direto pela API.** Uma chamada com a chave do projeto.
     Quem já chama uma API REST não instala pacote nenhum. Mostre o bloco de código.
   - **3. Você pergunta — no painel ou no Claude.** Pelas telas, quando quer olhar. Pelo
     Claude, quando a pergunta aparece no meio do trabalho.
5. **"Pergunte em português"** — a seção que fecha o argumento. Mostre a conversa real:
   alguém pergunta *"o que andou acontecendo no CRM esta semana?"* sem citar nome de
   evento nenhum, e o Claude responde com números e um gráfico, porque leu o catálogo
   sozinho. **Esta seção é a mais importante da página.**
6. **O que ela não é.** Uma lista curta e honesta: não é web analytics, não tem funil, não
   tem teste A/B, não tem session replay. Cada item é uma pergunta que outra ferramenta
   responde melhor. Ser explícito aqui gera confiança, não perde venda.
7. **Preço.** Grátis: 1 projeto e 1 mês de histórico. Pago: **R$ 50/mês**, projetos
   ilimitados e 12 meses. Diga em voz alta que **não se cobra por volume de evento** —
   mandar mais eventos nunca aumenta o preço, porque instrumentar bem é o que a plataforma
   quer incentivar.
8. **Rodapé.** Dab Lab, link para os termos em `https://app.visaodeproduto.com.br/termos`,
   e o botão "Começar" de novo.

### Tom de voz

Direto, curto, sem jargão de marketing. Frases afirmativas. Zero "revolucione", zero
"potencialize", zero "solução completa". O produto se orgulha do que **recusa** fazer —
o texto deve soar assim.

### Direção visual

**Referência de estilo:** a peça do SXSW anexada — tipografia pesadíssima e enorme, muito
espaço em branco, ilustração desenhada à mão com traço grosso e cores chapadas, uma cor de
destaque forte usada com coragem, e um segundo texto em **fonte monoespaçada** como
contraponto. Copie essa energia, não o layout.

**Cores.** A base vem do aplicativo:

| Uso | Claro | Escuro |
|---|---|---|
| Fundo | `#ffffff` | `#0b0c0e` |
| Superfície | `#fbfbfc` | `#101115` |
| Linha | `#e7e8ec` | `#23262c` |
| Texto | `#17181c` | `#e9eaee` |
| Texto secundário | `#63666e` | `#9b9ea6` |
| **Primária** | `#007aff` | `#0a84ff` |
| Positivo | `#1a7f37` | `#3fb950` |
| Erro | `#c9303d` | `#f0616d` |

O azul primário é o da Apple e é o fio que liga o site ao app — use nos botões, nos links
e nas barras dos gráficos.

**Além dele, acrescente duas ou três cores divertidas** para as ilustrações e os blocos de
destaque, na energia da referência: um laranja quente, um verde ácido, um rosa. Elas ficam
nas ilustrações e nos fundos de seção, **nunca** em botão nem em gráfico — ali só entra o
azul, para o site não desmentir o aplicativo.

**Tipografia.** Um sem-serifa pesado para os títulos, em tamanho generoso. Uma
monoespaçada para código, nomes de evento e detalhes técnicos — os nomes de evento
(`crm_lead_criado`) devem sempre aparecer em mono, porque é assim que eles vivem no app.

**Ilustração.** Uma ou duas, no traço da referência: grosso, desenhado à mão, cor chapada.
Sugestões de cena: alguém olhando um gráfico onde uma barra está em zero; ou um balão de
conversa saindo de um gráfico de barras.

### Regras técnicas

- Página única, responsiva, mobile-first de verdade.
- **Modo claro e escuro**, respeitando a preferência do sistema.
- Sem formulário, sem captura de e-mail, sem cookie de rastreamento. O único caminho de
  conversão é o botão que leva ao aplicativo — o produto prega que nada é capturado sem
  ser declarado, e o site não pode desmentir isso.
- Os prints em `<img>` com `alt` descritivo, dentro de moldura com sombra suave e cantos
  arredondados de 12px, no mesmo raio do app.

---

## Imagens que eu vou anexar

**Referência de estilo:** a peça do SXSW.

**Prints do aplicativo** (todos em modo escuro, que é o padrão do app):

| Print | Onde | Por que ele está no site |
|---|---|---|
| Painel do CRM Vendas | `/p/crm-vendas/painel` | A imagem do topo. Mostra o produto em uso |
| Tela de Uso | `/p/crm-vendas/uso` | **O mais importante depois da conversa.** É onde os dois eventos com zero aparecem |
| Atividade | `/p/crm-vendas/atividade` | Mostra que todo evento vem com descrição em português |
| Conversa com o Claude | Claude Desktop | A seção 5. Pergunta em português, resposta com gráfico |
| Trecho de código | `/conta/como-usar` | O passo 2, com as abas SDK e API |
