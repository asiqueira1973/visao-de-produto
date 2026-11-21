# O desenho da arquitetura

O que vale é [`../images/arquitetura.jpg`](../images/arquitetura.jpg), usado no README da
raiz. Esta pasta guarda como ele é feito, para a próxima alteração não começar do zero.

O desenho é gerado, não desenhado à mão: `gerar.py` monta um SVG em que cada retângulo é
percorrido duas vezes com os lados trêmulos — o mesmo efeito do Excalidraw, mas
determinístico. A fonte é a [Caveat](https://fonts.google.com/specimen/Caveat), embutida no
SVG em base64 para a renderização não depender de rede. As capturas de tela vêm de
`../images/`, e são as mesmas do README.

## Refazer

As fontes não estão no git. Baixe as duas, gere o SVG e rasterize:

```bash
cd docs/arquitetura

curl -sA Mozilla "https://fonts.googleapis.com/css2?family=Caveat:wght@400..700" -o caveat.css
curl -s "$(grep -o 'https://[^)]*\.ttf' caveat.css | sed -n 1p)" -o Caveat-Regular.ttf
curl -s "$(grep -o 'https://[^)]*\.ttf' caveat.css | sed -n 4p)" -o Caveat-Bold.ttf
rm caveat.css

python3 gerar.py
swiftc -O rasterizar.swift -o rasterizar
./rasterizar diagrama.svg saida.png 2460 1880
sips -Z 2000 saida.png >/dev/null
sips -s format jpeg -s formatOptions 86 saida.png --out ../images/arquitetura.jpg >/dev/null
rm saida.png
```

`rasterizar.swift` fotografa o SVG com o WKWebView do próprio macOS, em 2x, e por isso não
precisa de nenhuma dependência instalada. Rende em 4920px e reduz para 2000px: sai mais
limpo do que rasterizar direto no tamanho final.

## Duas regras ao mexer

**Só entram capturas com dado de demonstração.** O repositório é público. As telas do
produto `CRM Vendas` têm vendedores e e-mails inventados, de propósito — captura com dado
real de usuário não entra aqui nem no README.

**Confira o resultado antes de commitar.** O posicionamento é por coordenada absoluta: mexer
no tamanho de uma caixa costuma empurrar texto para fora da borda ou fazer uma seta cruzar
uma legenda, e isso só aparece olhando.
