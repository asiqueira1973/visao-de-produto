# Ligar a cobrança — o que falta, e é rápido

Tudo que não dependia de você está pronto e verificado. Sobra **um item seu**, e depois
três comandos que eu rodo.

---

## O que já está feito

| | |
|---|---|
| Conta Stripe | **Ativada de verdade.** `charges_enabled`, `payouts_enabled`, `details_submitted`, sem pendências. Brasil, BRL |
| Código da cobrança | Checkout, portal, webhook e reconciliação — escritos e testados com um pagamento real de R$ 50 |
| E-mail de pagamento recusado | **Ligado.** Provado no dev com webhook assinado: a conta virou `atrasada` e o e-mail chegou |
| Retentativa da mesma fatura | Não vira segundo e-mail. Provado disparando o mesmo `in_…` duas vezes |
| Nota fiscal | Roteiro em [`NOTA-FISCAL.md`](NOTA-FISCAL.md) e o script que lista quem pagou |
| Produção | No ar, saudável, **com a cobrança desligada** — como estava |

---

## O que depende de você — 2 minutos

**Me passe a chave secreta de produção da Stripe.**

Stripe → canto superior direito, sair do **modo de teste** → Developers → API keys →
**Secret key**, a que começa com `sk_live_`. Clique em *Reveal* e cole aqui no chat.

É só isso. Com ela eu faço o resto.

> Se preferir não colar a chave inteira, dá para criar uma **restricted key** com escrita em
> Products, Prices, Checkout Sessions, Customers, Subscriptions, Invoices e Webhook
> Endpoints. Funciona igual e é mais fácil de revogar depois. A chave completa é mais
> simples; a decisão é sua.

---

## O que eu faço com ela

**1. Crio produto, preço e webhook em produção.**

```bash
node --experimental-strip-types scripts/ligar-cobranca-em-producao.ts sk_live_...
```

O script é idempotente: procura antes de criar, então rodar duas vezes não duplica nada —
foi escrito assim porque em modo de teste já nasceram dois produtos iguais. Ele confere a
conta, cria o produto *Visão de Produto — Plano pago* a R$ 50/mês em BRL, registra o
webhook em `app.visaodeproduto.com.br/api/cobranca/webhook` com os seis eventos que o
código sabe tratar, e grava tudo no `.env.producao`, que fica fora do git.

Já rodei em modo `--ensaio` contra o ambiente de teste: encontrou o produto e o preço que
existem, e apontou corretamente que o webhook de produção ainda não existe.

**2. Empurro as três variáveis para a Vercel**, ambiente Production: `STRIPE_SECRET_KEY`,
`STRIPE_PRICE_ID` e `STRIPE_WEBHOOK_SECRET`.

**3. Publico e confiro** que `cobrancaConfigurada()` passou a devolver verdadeiro e que a
tela de assinatura mudou de estado.

---

## Depois disso, o teste que importa

Uma assinatura de verdade, com cartão de verdade, na sua própria conta — que é cortesia,
então dá para cancelar em seguida sem consequência. É o que prova que o dinheiro entra, o
webhook chega e a conta é promovida.

**Isso custa R$ 50 reais seus**, cobrados no seu cartão e recebidos na sua conta Stripe,
menos a taxa. Vale a pena: é a diferença entre achar que funciona e saber.

Se preferir não gastar, a alternativa é confiar no teste que já foi feito em modo de
teste — que exercitou o mesmo código, com os mesmos webhooks, mudando só a chave.

---

## O que ainda vai faltar depois de ligado

**A primeira nota fiscal.** Duas coisas em [`NOTA-FISCAL.md`](NOTA-FISCAL.md) estão
marcadas como *a confirmar com a Contabilizei*, e só você pode responder:

1. O **prazo municipal** de emissão da NFS-e.
2. O **código de serviço municipal** e a **alíquota do ISS** para software como serviço no
   seu município.

Nenhuma das duas bloqueia ligar a cobrança. Elas bloqueiam a primeira nota — e a primeira
nota só existe depois do primeiro cliente.
