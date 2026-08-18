# Épico 9 — Cobrança e administração (F10)

Desenho, não implementação. A seção 25 do `spec.md` mantém F10 fora do MVP, e este
documento existe para que o dia de escrever código não comece com decisão pendente.

| | |
|---|---|
| Origem | Pergunta 22.1 do spec (preço) e item F10 da seção 25 |
| Decidido com o dono em | 17 de agosto de 2026 |
| Estado | Desenhado. **Não implementado** |
| Bloqueio | **Nenhum.** O último caiu quando o dono mandou o formulário da Contabilizei |

---

## 1. As decisões, e o que cada uma descarta

| # | Decisão | O que ela descarta, e por quê |
|---|---|---|
| C1 | **Volume de evento não é preço.** Existe teto, mas como válvula de segurança contra abuso e loop maluco | Descarta a cobrança por evento. Ela puniria instrumentar, que é o comportamento que a plataforma existe para criar: diante de um teto, a resposta racional de quem constrói é instrumentar menos, e catálogo pobre é produto inútil (regra 11.15) |
| C2 | **Um preço, todos os projetos.** Não se multiplica por projeto | Descarta preço por projeto. O público faz vários apps pequenos; cobrar por projeto faz a pessoa hesitar antes de criar um, e hesitação no onboarding contraria o princípio 0.5 |
| C3 | **R$ 50/mês, em real, via Stripe Brasil** | Descarta cobrar em USD, que era a decisão anterior. Ela caiu por um fato: a conta Stripe do dono é brasileira e liquida em BRL. Consequência assumida: **obrigação de emitir nota fiscal de serviço**, tratada na seção 5. Em troca, o comprador brasileiro não paga IOF nem spread — o que o spec chamava de risco (R10) vira, para o público-alvo, uma compra mais simples |
| C4 | **A retenção é o que separa grátis de pago.** Grátis: 1 projeto, 1 mês de janela. Pago: projetos ilimitados, 12 meses | É o único gatilho que não custa nada dar e não pune uso nenhum. A dor aparece depois que a pessoa já gostou — quando ela pergunta "o que mudou desde o lançamento?" e a janela não alcança |
| C5 | **Admin lê agregado, nunca evento.** Sem política nova nas tabelas existentes | Descarta `or eh_admin()` nas políticas de RLS. Seriam 14 lugares novos para errar, e o erro vaza dado entre contas — o único erro deste produto que não tem conserto |
| C6 | **Rebaixar não apaga e não bloqueia leitura.** Bloqueia criar projeto novo e encolhe a janela | Descarta apagar dado de quem parou de pagar. Gera raiva desproporcional ao dinheiro envolvido, e voltar a pagar tem que devolver tudo |
| C7 | **Cortesia vitalícia é uma coluna**, não uma integração | Uma conta pode ser paga sem nunca ter passado pelo Stripe |

**Preço:** R$ 50/mês. **Teto de válvula:** a definir, na ordem de 1 milhão de eventos por
mês por conta — um número que ninguém do público-alvo alcança por acidente. Quem chegar
perto recebe aviso e conversa; não é cortado.

---

## 2. O que muda no modelo de dados

O trabalho é pequeno de propósito: a v1 já criou os campos que a cobrança precisa
(`contas.plano`, `retencao_meses`, `limite_projetos`, `stripe_cliente_id`) e a medição
(`uso_mensal`, alimentada por `fn_agrega_uso_mensal`). Isto aqui é adição, não reescrita.

### `contas` — colunas novas

| Coluna | Tipo | Para quê |
|---|---|---|
| `cortesia` | boolean, default false | Conta paga sem Stripe (decisão C7). Enquanto verdadeira, nenhuma rotina de cobrança encosta nela |
| `assinatura_id` | text | Id da assinatura no Stripe. Nulo em conta gratuita e em cortesia |
| `assinatura_status` | `status_assinatura` | O estado **espelhado** do Stripe. Nunca é escrito pela tela |
| `periodo_fim` | timestamptz | Até quando o período pago vale. É o que a carência usa |

### Enum novo

`status_assinatura`: `nenhuma`, `ativa`, `atrasada`, `cancelada`.

O nome importa: é **espelho**, não verdade. A verdade mora no Stripe, e a reconciliação da
seção 4 existe justamente porque espelho desatualiza.

### `eventos_stripe` — a tabela que evita cobrar duas vezes

| Coluna | Para quê |
|---|---|
| `id` | O `event.id` do Stripe. **Chave primária** |
| `tipo` | `checkout.session.completed`, `customer.subscription.updated`, … |
| `conta_id` | A conta afetada, quando dá para resolver |
| `recebido_em` | Quando chegou |
| `processado_em` | Nulo enquanto não foi aplicado |

Webhook chega duplicado, fora de ordem e às vezes duas vezes ao mesmo tempo. O `insert`
com a chave primária do Stripe é o que torna o processamento idempotente: se a linha já
existe, o evento já foi visto e o handler devolve 200 sem fazer nada.

### `administradores` — quem enxerga a plataforma inteira

| Coluna | Para quê |
|---|---|
| `usuario_id` | FK para `auth.users` |
| `criado_em` | Quando virou admin |
| `criado_por` | Qual admin concedeu. Nulo só na primeira linha, semeada por migration |

Admin é da **plataforma**, não da conta — por isso tabela própria, e não um valor novo em
`papel_conta`, que descreve papel dentro de uma conta.

### `acoes_admin` — auditoria

| Coluna | Para quê |
|---|---|
| `admin_id` | Quem fez |
| `acao` | `concedeu_cortesia`, `removeu_cortesia`, `mudou_plano`, `consultou_conta` |
| `conta_alvo` | Sobre quem |
| `detalhe` | jsonb com o antes e o depois |
| `feito_em` | Quando |

Vale para o dono também. Auditoria que tem exceção para o dono não é auditoria.

---

## 3. Os fluxos

### 3.1 — Assinar

1. A tela de Perfil ganha "Assinar" quando a conta é gratuita.
2. Rota de servidor cria a Checkout Session no Stripe, com `client_reference_id = conta_id`
   e `customer` reaproveitado quando a conta já tem `stripe_cliente_id`.
3. O navegador vai para o Stripe. A pessoa paga lá — **nenhum dado de cartão passa pela
   plataforma, em nenhum momento.**
4. Volta para `/conta/perfil?assinatura=processando`.

**A regra dura:** a volta do navegador **não** muda plano nenhum. Ela só mostra "estamos
confirmando". Quem muda o plano é o webhook. Redirect é o navegador falando; webhook é o
Stripe falando, e só um dos dois é confiável.

### 3.2 — Webhook

Rota pública, assinatura verificada com o segredo do Stripe. Fora do proxy de sessão.

1. Verifica a assinatura. Falhou, 400 e nada acontece.
2. `insert into eventos_stripe (id, …) on conflict do nothing`. Zero linhas afetadas
   significa "já vi esse evento" → responde 200 e para.
3. Aplica o efeito conforme o tipo:

| Evento do Stripe | Efeito |
|---|---|
| `checkout.session.completed` | `plano = 'pago'`, `retencao_meses = 12`, `limite_projetos = null`, guarda `assinatura_id` e `stripe_cliente_id` |
| `customer.subscription.updated` | Espelha `assinatura_status` e `periodo_fim` |
| `customer.subscription.deleted` | `assinatura_status = 'cancelada'`. **Não rebaixa agora** — quem rebaixa é o cron, depois de `periodo_fim` |
| `invoice.payment_failed` | `assinatura_status = 'atrasada'`. O Stripe cuida das retentativas |

4. Marca `processado_em` e responde 200.

Qualquer erro no meio devolve 500 **sem** marcar `processado_em`: o Stripe reenvia, e o
`on conflict` da etapa 2 precisa considerar isso — reprocessar evento não aplicado é
correto, reprocessar evento já aplicado não é.

### 3.3 — Rebaixamento (decisão C6)

Dispara quando `assinatura_status` é `cancelada` e `periodo_fim` já passou.

| O que acontece | O que **não** acontece |
|---|---|
| `plano = 'gratuito'` | Nenhum evento é apagado |
| `retencao_meses = 1` | Nenhum projeto é apagado nem arquivado |
| `limite_projetos = 1` | A leitura não é bloqueada |
| Criar projeto novo passa a ser recusado | A exportação continua funcionando |

Conta que tinha 4 projetos continua com 4, todos legíveis, todos recebendo evento. Ela só
não cria o quinto. Voltar a pagar devolve a janela de 12 meses **sobre os dados que nunca
saíram do banco** — a retenção física é de 12 meses para todo mundo (regra 11.8), e é
exatamente isso que torna o retorno indolor.

### 3.4 — Cortesia

Admin marca `cortesia = true`. A conta vira `plano = 'pago'`, `retencao_meses = 12`,
`limite_projetos = null`, e **toda rotina de cobrança passa direto por ela**. Sem cliente no
Stripe, sem assinatura, sem cobrança, sem rebaixamento. Fica em `acoes_admin`.

---

## 5. Nota fiscal — a consequência de cobrar em real

Cobrar em real, como pessoa jurídica brasileira prestando serviço, obriga a **emitir NFS-e**.
A Stripe não emite: ela processa pagamento, e nota fiscal de serviço é municipal. Então esta
parte é nossa, e o dono assumiu o trabalho de olhos abertos.

### O que a plataforma precisa guardar

Resolvido olhando o formulário real da Contabilizei, que é por onde o dono já emite. Os
campos obrigatórios **dependem do tipo de tomador**, e a diferença é grande:

| Tomador | Obrigatório | Opcional |
|---|---|---|
| **Pessoa física** | CPF, nome completo | e-mail, telefone, endereço |
| **Pessoa jurídica** | CNPJ, razão social, CEP, endereço, número, bairro, município, estado | e-mail, telefone, complemento, inscrição municipal |

Ou seja: **pessoa física pede dois campos.** Endereço, na Contabilizei, fica atrás de um
botão desligado por padrão para PF — então não vamos pedir o que a nota não exige.

### Como isso vira tela sem virar formulário chato

O checkout pergunta primeiro **"pessoa física ou jurídica?"**, e daí:

- **PF:** CPF e nome completo. Dois campos. Fim.
- **PJ:** CNPJ e CEP, e o resto é preenchido sozinho. Consultar CNPJ devolve razão social e
  endereço completo; consultar CEP devolve logradouro, bairro, município e estado. Sobra o
  número para a pessoa digitar.

Sem consulta automática, PJ seriam oito campos, e oito campos entre a pessoa e o pagamento
é onde carrinho morre. Com consulta, são três: CNPJ, CEP e número. **Isso é requisito do
épico, não enfeite** — a estratégia declarada é não causar desconforto ao público-alvo.

Fica registrado que o formulário também oferece "cliente do exterior". Não é para agora, mas
significa que vender para fora não exigiria trocar de ferramenta de emissão.

### Emissão: manual primeiro, automática só quando doer

A recomendação é **não automatizar na primeira versão**. Automatizar NFS-e é um projeto por
si: certificado digital A1, numeração de RPS, cancelamento, e a API da prefeitura — que pode
ou não estar no padrão nacional. Fazer isso antes do primeiro cliente é construir uma
esteira para uma fábrica que ainda não abriu. O dono já emite nota pela **Contabilizei**,
então a fase 1 é copiar dados para um formulário que ele já preenche todo mês.

| Fase | Como | Quando muda |
|---|---|---|
| **1** | Uma tela de admin lista as cobranças do mês com os dados do tomador prontos para copiar. O dono emite pela Contabilizei, que ele já usa para isso | Até doer |
| **2** | Emissão automática pela API, disparada pelo webhook de pagamento confirmado | Quando o volume justificar — na casa das dezenas de clientes por mês, não antes |

O que a fase 1 exige de código é pequeno: uma consulta e uma tela. O que a fase 2 exige é um
épico próprio. Começar pela 1 não fecha nenhuma porta: os dados do tomador já estarão
guardados desde o primeiro cliente, que é a parte que dói fazer depois.

### O que continua fora do nosso alcance

Apuração de imposto, DAS, escrituração e a decisão de regime tributário são do contador. A
plataforma guarda dado e ajuda a emitir; ela não calcula imposto e não substitui contabilidade.

---

## 6. Os jobs

| Job | Quando | O que faz |
|---|---|---|
| `reconcilia_assinaturas` | diário | Para cada conta com `stripe_cliente_id`, relê a assinatura no Stripe e corrige divergência. **É este que salva quando um webhook se perde — e um vai se perder** |
| `aplica_rebaixamento` | diário | Executa a seção 3.3 nas contas com período vencido |
| `avisa_teto_de_eventos` | diário | Avisa quem passou de 80% do teto de válvula. Aviso, não corte |
| `expurga_eventos_stripe` | semanal | Apaga evento processado com mais de 90 dias |

`fn_agrega_uso_mensal` já existe desde a v1 e não muda: a cobrança **lê** a medição, não a
produz.

---

## 7. Administração

### O que o admin vê

Uma tela nova, `/admin`, com a lista de contas e, por conta: nome, e-mail do dono, plano,
status da assinatura, data de criação, e os números de `uso_mensal` — eventos, projetos
ativos, pessoas, consultas do MCP.

### O que o admin **não** vê

Evento, propriedade, `distinct_id`, catálogo, painel. Nada de dado de aplicativo de
cliente. Para saber se uma conta está viva basta `uso_mensal`; ler os eventos dela não
acrescenta nada e é justamente o que destrói a confiança que o produto vende.

### Como isso é construído (decisão C5)

- **Nenhuma política existente é tocada.** Nada de `or eh_admin()` em lugar nenhum.
- Um conjunto novo de funções `security definer` que devolvem **apenas agregado**, com
  `execute` concedido só a quem está em `administradores`.
- Toda leitura e toda escrita de admin gravam em `acoes_admin`.
- O primeiro admin entra por migration, pelo e-mail do dono. Os seguintes, pela tela.

### O limite que não se cruza

O princípio 0.6 continua valendo: **nenhum caminho do usuário pode depender de um admin.**
Assinar, cancelar, exportar e encerrar continuam sendo autosserviço. Admin é para o dono
enxergar o negócio, nunca para destravar alguém — se aparecer um "preciso do Alexandre para
X", X está mal desenhado.

---

## 8. O que a interface ganha

| Tela | O que muda |
|---|---|
| Perfil | Cartão de assinatura: plano, o que ele inclui, preço em USD **com o aviso de compra internacional**, botão de assinar ou de gerenciar |
| Perfil | Conta em cortesia mostra isso, sem botão de pagamento |
| Projetos | Ao bater o limite, a mensagem diz o que fazer, e não só que não deu |
| Uso | Barra de aproximação do teto de válvula, só acima de 80% |
| Termos | Seções de cobrança — **já escritas**, nesta rodada |

Cancelar assinatura é o Portal do Cliente da Stripe: trocar cartão, ver fatura e cancelar
acontecem lá, sem tela nossa e sem ninguém no meio (princípio 0.6).

---

## 9. Segurança

- `STRIPE_SECRET_KEY` e `STRIPE_WEBHOOK_SECRET` vivem só em rota de servidor. Nunca no bundle.
- A rota de webhook fica fora do proxy de sessão e **verifica a assinatura antes de ler o
  corpo**. Webhook sem verificação é um endpoint que qualquer um usa para virar cliente pago.
- Nenhum dado de cartão toca a plataforma. Nem para exibir os quatro últimos dígitos — isso
  vem da API do Stripe na hora, nunca do nosso banco.
- `get_advisors` depois de toda DDL, como sempre.

---

## 10. Fora deste épico

- Plano de agência ou de time. Só quando aparecer alguém com 50 apps, e não antes.
- Cupom, teste grátis por tempo, preço por região.
- Convite de membro (F4) — continua v2 e é independente disto.
- Fatura própria: quem emite recibo é o Stripe.

---

## 11. O que precisa ser verificado ANTES de escrever código

A lista original tinha seis itens. Cinco não bloqueavam nada e foram cortados pelo dono, com
razão: numa fase de emissão manual, saber a alíquota de ISS muda o lucro, não o software.

| # | O que resolver | Com quem | Por que **bloqueia** |
|---|---|---|---|
| ~~V1~~ | ~~Quais dados a Contabilizei exige do tomador?~~ | — | **Resolvido.** O dono mandou o formulário real, e a resposta está na seção 5: PF pede CPF e nome; PJ pede CNPJ, razão social e endereço |
| V2 | O número do teto de válvula | Decisão do dono | Só falta escolher. Não bloqueia: dá para subir sem teto e definir depois |

### Cortados, e por quê

| Era | Por que saiu |
|---|---|
| Conta Stripe brasileira cobrando em USD | Resolvido mudando a moeda para BRL |
| Cidade no padrão nacional de NFS-e | Só importa para a fase 2, que foi adiada. E a Contabilizei pode emitir no lugar disso |
| Regime tributário, CNAE, alíquota de ISS | Muda o líquido do dono, não o produto. Conversa de contador, não requisito de software |
| Taxa da Stripe e prazo de repasse | Idem. Fica registrado que sobre R$ 50 a taxa fica perto de R$ 2,50 |
| Cartão ou Pix Automático | Decisão de produto para **depois** do primeiro cliente pagante. Vale saber que existe: cartão no Brasil recusa mais, e parte do público-alvo não tem limite sobrando |

**Pergunta 22.6 do spec — contrato de operação revisado por advogado — continua aberta.** O
dono decidiu seguir sem advogado neste momento e autorizou a redação do texto de Termos, que
nesta rodada passou a falar de cobrança, preço em real e nota fiscal. Fica registrado que
**é texto escrito por agente, não parecer jurídico.**
