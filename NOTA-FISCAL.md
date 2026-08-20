# Nota fiscal — o que fazer quando alguém paga

Roteiro operacional, não jurídico. Cobrar em real, como PJ brasileira prestando serviço,
obriga a emitir **NFS-e**. A Stripe não emite: ela processa pagamento, e nota fiscal de
serviço é municipal. Essa parte é manual por decisão registrada no
[`EPICO-COBRANCA.md`](EPICO-COBRANCA.md), seção 5 — automatizar NFS-e é projeto próprio e
não se paga antes de dezenas de clientes por mês.

---

## 1. Quando

Uma vez por mês, depois que as cobranças do mês caíram. A Stripe cobra na data de
aniversário de cada assinatura, então o mês tem faturas espalhadas — emitir tudo de uma vez
no fim é mais simples do que perseguir uma a uma.

> **A confirmar com a Contabilizei, e anotar aqui:** o prazo de emissão é municipal e muda
> de cidade para cidade. Enquanto esta linha estiver assim, pergunte antes de deixar para o
> fim do mês.

## 2. Quem pagou, e com quais dados

```bash
node --experimental-strip-types --env-file=.env.producao scripts/notas-a-emitir.ts 2026-08
```

Sai um bloco por cliente, já no formato do formulário da Contabilizei: tipo de tomador,
documento, nome ou razão social, e o endereço quando for PJ. O último argumento é o mês; sem
ele, usa o mês corrente.

O script **não emite nada e não marca nada**. Ele só evita garimpar dado em dois sistemas.
Quem registra o que saiu é a própria Contabilizei.

## 3. O que preencher

| Campo na Contabilizei | De onde vem |
|---|---|
| Tomador: pessoa física ou jurídica | `tipo` |
| CPF / CNPJ | `documento` |
| Nome completo / Razão social | `nome` |
| E-mail | `email_nota`, quando existir |
| CEP, endereço, número, bairro, município, estado | só para **PJ** — o script imprime |
| Valor | **R$ 50,00** por assinatura no mês |
| Descrição do serviço | `Assinatura mensal da plataforma Visão de Produto — product analytics` |

**Pessoa física pede dois campos: CPF e nome.** Endereço, para PF, fica atrás de um botão
desligado por padrão na Contabilizei — não preencha o que a nota não exige.

> **A confirmar com a Contabilizei, e anotar aqui:** o código de serviço municipal e a
> alíquota do ISS que se aplicam a software como serviço no seu município. Eles não mudam de
> cliente para cliente, então valem uma anotação única.

## 4. Quando o script diz "SEM DADOS DE COBRANÇA"

Significa que existe fatura paga sem tomador cadastrado. **Não é normal**, e vale entender
antes de sair pedindo dado por e-mail:

A tela de assinatura **exige** os dados antes de abrir o pagamento — `abrirCheckout` recusa
com *"Preencha os dados da nota fiscal antes de pagar"* quando `dados_de_cobranca` está
vazia. Então uma fatura sem tomador só aparece se o pagamento nasceu **fora** do fluxo
normal: um teste falando direto com a API da Stripe, uma assinatura criada à mão no painel,
ou uma cobrança recorrente de alguém cujos dados foram apagados depois.

Se aparecer com cliente de verdade, o caminho é pedir os dados por e-mail e preencher a nota
à mão — e **investigar por onde aquele pagamento entrou**, porque é buraco no fluxo.

## 5. O que a plataforma guarda, e o que ela não guarda

Guarda em `dados_de_cobranca`: tipo, documento, nome, e-mail da nota e, para PJ, o endereço
completo. Preenchido uma vez, no primeiro pagamento, com consulta automática de CNPJ e CEP
para o cliente digitar três campos em vez de oito.

**Não guarda** nada de cartão. Número, validade e CVV nunca passam pela plataforma: quem
coleta é o checkout da própria Stripe, em domínio dela.

## 6. Quando isto virar tabela

Hoje não há controle de "já emiti". Com um punhado de clientes, a Contabilizei é o registro
e a memória basta. Isso deixa de valer quando:

- for difícil olhar a lista do mês e saber o que falta, ou
- alguém receber nota duplicada, ou
- o volume passar do que dá para conferir de cabeça.

Aí o conserto é uma tabela `notas_fiscais` com a fatura como chave primária, e o script
passa a listar só o que falta. É migration pequena — o que não vale é fazer antes de doer.
