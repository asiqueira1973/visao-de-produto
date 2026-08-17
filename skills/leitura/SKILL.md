---
name: visao-leitura
description: Responde perguntas sobre uso de aplicativos consultando a Visão de Produto pelo MCP. Use quando perguntarem "alguém está usando isso?", "o que aconteceu no app essa semana?", "quem usou e o quê", "quantas pessoas entraram", ou qualquer pergunta sobre uso real de uma feature de um app instrumentado.
---

# Responder sobre uso, pela Visão de Produto

As perguntas do construtor são de três tipos, e só três: *alguém está usando isso?*,
*quem usou, e o quê?*, *o que aconteceu no app hoje?*. Esta skill diz como respondê-las com
dado, e não com impressão.

## Qual tool para qual pergunta

| A pergunta | A tool |
|---|---|
| "alguém está usando X?" | `uso_por_evento` com o projeto e a janela |
| "o que aconteceu hoje / essa semana?" | `atividade_recente`, com `desde` quando fizer sentido |
| "quem é essa pessoa, o que ela fez?" | `pessoa` com o `distinct_id` |
| "o que esse app registra?" | `catalogo` |
| qualquer corte que as outras não dão | `consulta`, com um `select` |

Comece sempre pelo `catalogo` quando não souber os nomes de evento do projeto. **Nunca
invente nome de evento.** Se o catálogo não tem, o evento não existe — e isso é a resposta,
não um obstáculo.

## Responda em prosa, citando a descrição

Cada resposta das tools traz a descrição junto do nome técnico. Use a **descrição** ao
falar com a pessoa, e guarde o nome técnico para quando ela pedir precisão.

- bom: "três pessoas registraram pagamento essa semana, doze vezes no total"
- ruim: "psi_novo_pagamento: 12 eventos, 3 usuários únicos"

## A distinção que mais importa

Quando um evento aparece com **zero**, existem duas leituras completamente diferentes, e
confundi-las é o pior erro possível aqui:

1. **A feature está instrumentada e ninguém usou.** O evento está no catálogo com zero
   ocorrências no período. A resposta é "ninguém usou isso".
2. **A feature nunca foi instrumentada.** Não existe evento nenhum sobre ela no catálogo. A
   resposta é "não dá para saber: isso nunca foi instrumentado" — e a sugestão natural é
   instrumentar.

Se o catálogo do projeto estiver vazio, a resposta nunca é "ninguém usou o app". É "este
app ainda não manda evento nenhum".

## Cuidados ao responder

- **Não invente tendência.** Com dezenas de eventos por dia, "caiu 30%" costuma ser ruído.
  Fale de número absoluto e de período.
- **Não infira sessão nem engajamento.** A plataforma não tem esse conceito, de propósito.
  "Usuários únicos" é contagem de identificadores distintos, nada além disso.
- **Não some períodos diferentes** de janelas diferentes como se fossem comparáveis.
- **`distinct_id` costuma ser e-mail**, e portanto dado pessoal. Cite quando a pergunta é
  sobre uma pessoa específica; não faça lista de e-mails quando a pergunta é sobre volume.
- **A janela visível depende do plano da conta**: no plano gratuito, um mês. Se a pergunta
  for sobre algo mais antigo, diga que está fora da janela em vez de responder zero.

## Quando a pergunta pede um corte que as tools não dão

Use `consulta` com um `select` sobre `eventos`, `definicoes_evento`, `pessoas` e
`projetos`. Só leitura, uma instrução, no máximo 500 linhas. Exemplo:

```sql
select distinct_id, count(*) as vezes
from eventos
where nome = 'psi_novo_pagamento'
  and ocorrido_em > now() - interval '7 days'
group by distinct_id
order by vezes desc
```

Se a consulta for recusada, a mensagem diz o motivo — leia antes de tentar de novo.
