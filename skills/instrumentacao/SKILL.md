---
name: visao-instrumentacao
description: Adiciona eventos da Visão de Produto ao código enquanto você implementa uma feature. Use sempre que terminar de implementar algo que uma pessoa vai usar — uma tela nova, um botão que salva, um fluxo que conclui — e o projeto tiver o SDK @dablab/visao instalado. Também use quando pedirem "instrumenta isso", "adiciona analytics", "quero saber se estão usando".
---

# Instrumentar uma feature na Visão de Produto

Você acabou de implementar alguma coisa. Esta skill diz como registrar **um** evento que
responda depois à pergunta "alguém está usando isso?".

## Antes de propor qualquer nome, leia o que já existe

Chame a tool `catalogo` do MCP `visao-de-produto` para o projeto em questão. Ela devolve:

- todos os eventos que o projeto já registrou, com a descrição de cada um;
- o **`prefixo_evento`** do projeto, que é a convenção de nome adotada ali.

Sem isso você vai inventar um nome que briga com os que já existem. Foi exatamente assim
que o histórico ficou com `psi_novo_pagamento` de um lado e `swim_geracao de treino` do
outro.

Se o MCP não estiver disponível, leia o código do app atrás de chamadas `track(` já
existentes e siga a convenção que encontrar.

## As regras do nome, que o banco cobra

O nome precisa casar com `^[a-z][a-z0-9_]{2,63}$`:

- minúsculas, começando por letra;
- de 3 a 64 caracteres;
- só letras, números e underscore.

**Espaço é inválido.** O evento é recusado na ingestão, no SDK e por check constraint no
banco — não existe caminho por onde ele passe.

O formato do nome é `<prefixo>_<verbo>_<substantivo>`, no passado, do ponto de vista de
quem usa: `psi_novo_pagamento`, `swim_geracao_treino`, `bbz_boleto_baixado`. Se o projeto
não tiver prefixo ainda, proponha um e grave em Configurações — ele passa a valer para
todas as instrumentações seguintes.

**Nunca reaproveite um nome existente com significado diferente.** Se o catálogo já tem
`psi_novo_pagamento` para "registrou um pagamento", não use o mesmo nome para "abriu a tela
de pagamento".

## A descrição não é opcional

Toda chamada leva `descricao`, em **português**, dizendo o que aconteceu em linguagem de
gente. Nome de evento sozinho é sigla; é a descrição que faz a tela e o agente entenderem.

Escreva do ponto de vista de quem usou, não do sistema:

- bom: `"usuário registrou um pagamento de um paciente"`
- ruim: `"evento de pagamento"`, `"POST /payments 201"`, `"payment_created"`

## Como fica a chamada

```ts
import { track } from "@dablab/visao";

track("psi_novo_pagamento", {
  descricao: "usuário registrou um pagamento de um paciente",
  tela: "PagamentosView",
  props: { valor: 250, forma: "pix" },
});
```

- `descricao` e `tela` ficam no nível de cima. Não os enfie dentro de `props`.
- `tela` é onde aconteceu; deixe de fora em evento disparado do backend.
- `props` é para o que ajuda a entender depois. Números e categorias, não texto livre.
- `track` devolve na hora. Nunca coloque `await`, nunca coloque em bloco crítico.

Antes do primeiro `track`, o app precisa ter chamado `identify(distinct_id)`. Sem isso o
evento não é enviado, porque a v1 não tem fluxo anônimo — e inventar um identificador seria
capturar dado que o app não declarou.

## Um evento por feature, e um só

Resista a instrumentar cada clique. A pergunta que o produto responde é "alguém usou esta
feature?", e para isso um evento no momento em que a ação **se completa** basta. Evento
demais transforma a tela de Uso num muro.

Se a pessoa quiser saber **quantas pessoas abrem o app**, isso não vem de graça: a
plataforma não captura nada sozinha. Proponha um evento declarado `app_aberto` na
inicialização — é a forma certa de responder essa pergunta aqui.

## O que nunca vai dentro de props

CPF, e-mail de terceiro, endereço, telefone, conteúdo de prontuário, mensagem de usuário,
token, senha. A plataforma não impede — quem instrumenta é responsável. Na dúvida, não
mande: um número e uma categoria respondem quase toda pergunta de produto.

## Onde colocar a chamada

No mesmo commit da feature, junto do ponto onde a ação se conclui — depois do salvamento
dar certo, não antes. Quem revisar o diff precisa ver a feature e o evento juntos.
