# -*- coding: utf-8 -*-
"""
Gera o desenho de arquitetura do Visão de Produto (docs/images/arquitetura.jpg).

O traço imita desenho à mão: cada retângulo é percorrido duas vezes com os
lados trêmulos, no mesmo espírito do Excalidraw. A fonte é a Caveat, embutida
no SVG em base64 para a renderização não depender de rede.

Como refazer:  python3 gerar.py && ./rasterizar diagrama.svg ../images/arquitetura.png 2460 1880
Veja o README desta pasta.
"""
import base64, io, math, os, random, struct

D = os.path.dirname(os.path.abspath(__file__))
IMG = os.path.join(D, "..", "images")
W, H = 2460, 1880
TINTA = "#1a1a1a"
FUNDO = "#fbfbf9"

def b64(caminho, mime):
    return "data:%s;base64,%s" % (mime, base64.b64encode(open(caminho, "rb").read()).decode())

FONTE_R = b64(os.path.join(D, "Caveat-Regular.ttf"), "font/ttf")
FONTE_B = b64(os.path.join(D, "Caveat-Bold.ttf"), "font/ttf")

saida = []
add = saida.append
esc = lambda t: t.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")

def dim(arquivo):
    return struct.unpack(">II", open(arquivo, "rb").read()[16:24])

# ------------------------------------------------------------- traço à mão
def caminho_retangulo(x, y, w, h, rnd, r=2.2):
    """Retângulo com os quatro lados trêmulos."""
    j = lambda a, b, raio: (a + rnd.uniform(-raio, raio), b + rnd.uniform(-raio, raio))
    cantos = [(x, y), (x + w, y), (x + w, y + h), (x, y + h)]
    p = []
    for i in range(4):
        x1, y1 = cantos[i]
        x2, y2 = cantos[(i + 1) % 4]
        a = j(x1, y1, r)
        b = j(x2, y2, r)
        c = j((x1 + x2) / 2, (y1 + y2) / 2, r * 1.6)
        p.append("M%.1f %.1f Q%.1f %.1f %.1f %.1f" % (a[0], a[1], c[0], c[1], b[0], b[1]))
    return " ".join(p)

def caixa(x, y, w, h, semente, larg=2.6, preenche=FUNDO):
    add('<rect x="%.1f" y="%.1f" width="%.1f" height="%.1f" rx="6" fill="%s"/>' % (x, y, w, h, preenche))
    for k in range(2):
        add('<path d="%s" fill="none" stroke="%s" stroke-width="%.1f" stroke-linecap="round" opacity="%.2f"/>'
            % (caminho_retangulo(x, y, w, h, random.Random(semente * 7 + k)), TINTA,
               larg - k * 0.9, 1 if k == 0 else 0.55))

def texto(x, y, t, tam=26, peso="400", cor=TINTA, anc="start", italico=False):
    add('<text x="%.1f" y="%.1f" font-family="Caveat" font-size="%d" font-weight="%s" fill="%s" '
        'text-anchor="%s"%s>%s</text>'
        % (x, y, tam, peso, cor, anc, ' font-style="italic"' if italico else "", esc(t)))

def mono(x, y, t, tam=17, cor="#444"):
    add('<text x="%.1f" y="%.1f" font-family="Menlo,monospace" font-size="%d" fill="%s">%s</text>'
        % (x, y, tam, cor, esc(t)))

def linhas(x, y, lista, tam=26, dy=34, peso="400", cor=TINTA, anc="start", italico=False):
    for i, l in enumerate(lista):
        texto(x, y + i * dy, l, tam, peso, cor, anc, italico)

def seta(x1, y1, x2, y2, semente, curva=0.14, larg=2.4):
    dx, dy = x2 - x1, y2 - y1
    cx = (x1 + x2) / 2 - dy * curva
    cy = (y1 + y2) / 2 + dx * curva
    add('<path d="M%.1f %.1f Q%.1f %.1f %.1f %.1f" fill="none" stroke="%s" stroke-width="%.1f" '
        'stroke-linecap="round"/>' % (x1, y1, cx, cy, x2, y2, TINTA, larg))
    ang = math.atan2(y2 - cy, x2 - cx)
    for s in (+1, -1):
        a = ang + math.pi + s * 0.42
        add('<path d="M%.1f %.1f L%.1f %.1f" stroke="%s" stroke-width="%.1f" stroke-linecap="round"/>'
            % (x2, y2, x2 + 17 * math.cos(a), y2 + 17 * math.sin(a), TINTA, larg))

def bonequinho(cx, cy, escala=1.0):
    s = escala
    t = lambda x1, y1, x2, y2: add(
        '<path d="M%.1f %.1f L%.1f %.1f" stroke="%s" stroke-width="2.6" stroke-linecap="round"/>'
        % (x1, y1, x2, y2, TINTA))
    add('<circle cx="%.1f" cy="%.1f" r="%.1f" fill="none" stroke="%s" stroke-width="2.6"/>'
        % (cx, cy, 22 * s, TINTA))
    t(cx, cy + 22 * s, cx, cy + 86 * s)
    t(cx - 34 * s, cy + 52 * s, cx + 34 * s, cy + 48 * s)
    t(cx, cy + 86 * s, cx - 28 * s, cy + 140 * s)
    t(cx, cy + 86 * s, cx + 28 * s, cy + 140 * s)

def telefone(x, y, w, semente):
    """Celular desenhado à mão. Devolve (altura, retângulo útil da tela)."""
    h = w * 2.0
    caixa(x, y, w, h, semente, larg=3.0, preenche="#ffffff")
    sx, sy, sw, sh = x + 14, y + 28, w - 28, h - 58
    caixa(sx, sy, sw, sh, semente + 3, larg=1.6, preenche="#fcfcfb")
    add('<rect x="%.1f" y="%.1f" width="56" height="9" rx="4.5" fill="%s" opacity="0.8"/>'
        % (x + w / 2 - 28, y + 13, TINTA))
    return h, (sx, sy, sw, sh)

def tela_mac(x, y, w, arquivo, semente):
    """Monitor de mesa desenhado à mão, com a captura dentro. Devolve a altura total."""
    m, queixo, ph = 12, 26, 34
    lw, lh = dim(arquivo)
    iw = w - 2 * m
    ih = iw * lh / float(lw)
    hb = ih + 2 * m + queixo
    caixa(x, y, w, hb, semente, larg=3.2, preenche="#f2f2f0")
    add('<image x="%.1f" y="%.1f" width="%.1f" height="%.1f" href="%s" preserveAspectRatio="none"/>'
        % (x + m, y + m, iw, ih, b64(arquivo, "image/png")))
    add('<path d="%s" fill="none" stroke="%s" stroke-width="1.6" opacity="0.7"/>'
        % (caminho_retangulo(x + m, y + m, iw, ih, random.Random(semente + 5), 1.2), TINTA))
    add('<circle cx="%.1f" cy="%.1f" r="5" fill="%s" opacity="0.55"/>'
        % (x + w / 2, y + hb - queixo / 2, TINTA))
    pw = w * 0.17
    caixa(x + w / 2 - pw / 2, y + hb, pw, ph, semente + 7, larg=2.4, preenche="#f2f2f0")
    bw = w * 0.42
    add('<path d="M%.1f %.1f Q%.1f %.1f %.1f %.1f" fill="none" stroke="%s" stroke-width="3.4" '
        'stroke-linecap="round"/>' % (x + w / 2 - bw / 2, y + hb + ph + 9, x + w / 2,
                                      y + hb + ph + 16, x + w / 2 + bw / 2, y + hb + ph + 9, TINTA))
    return hb + ph + 16

# =========================================================== o desenho
add('<svg xmlns="http://www.w3.org/2000/svg" width="%d" height="%d" viewBox="0 0 %d %d">'
    % (W, H, W, H))
add('<defs><style>'
    '@font-face{font-family:"Caveat";font-weight:400;src:url(%s) format("truetype");}'
    '@font-face{font-family:"Caveat";font-weight:700;src:url(%s) format("truetype");}'
    '</style></defs>' % (FONTE_R, FONTE_B))
add('<rect width="%d" height="%d" fill="%s"/>' % (W, H, FUNDO))

texto(120, 100, "Como o Visão de Produto funciona", 56, "700")
linhas(122, 158, [
  "Quem usa o seu app não sabe que isto existe. Cada ação que você escolheu acompanhar",
  "manda um evento para cá, e você lê de dois jeitos: no painel, pelo navegador, ou",
  "perguntando ao Claude pelo conector MCP. Nada é empurrado para você.",
], 27, 38, cor="#333")

texto(445, 330, "O seu app, em uso", 36, "700", anc="middle")
texto(1800, 330, "O que o dono do produto vê", 36, "700", anc="middle")

# ------------------------------------------------- esquerda: o app em uso
bonequinho(175, 470, escala=0.9)
linhas(175, 660, ["Quem usa", "o seu app", "não sabe que", "isto existe"], 25, 31,
       anc="middle", cor="#333")
seta(224, 520, 322, 545, 12, curva=0.05)

hT, (sx, sy, sw, sh) = telefone(330, 380, 230, 21)
texto(445, 437, "CRM Vendas", 22, "700", anc="middle")
add('<path d="M%.1f 452 Q445 449 %.1f 452" fill="none" stroke="%s" stroke-width="1.4" opacity="0.5"/>'
    % (sx + 12, sx + sw - 12, TINTA))
for i, linha in enumerate(["Ana · 3 leads", "Bruno · 5 leads", "Carla · 2 leads", "Diego · 4 leads"]):
    ry = 470 + i * 46
    caixa(sx + 12, ry, sw - 24, 38, 300 + i, larg=1.2, preenche="#ffffff")
    texto(sx + 24, ry + 26, linha, 19, cor="#444")
bx, by, bw2, bh2 = sx + 12, 692, sw - 24, 48
add('<rect x="%.1f" y="%.1f" width="%.1f" height="%.1f" rx="8" fill="%s"/>' % (bx, by, bw2, bh2, TINTA))
texto(445, by + 32, "Qualificar lead", 23, "700", cor="#ffffff", anc="middle")

texto(445, 878, "o seu app, em uso — o vendedor qualifica um lead", 25, anc="middle",
      italico=True, cor="#333")

seta(566, 700, 668, 940, 22, curva=0.10)
texto(712, 800, "a ação dispara", 24, anc="middle", italico=True)
texto(712, 826, "o evento", 24, anc="middle", italico=True)

caixa(270, 950, 470, 255, 23)
texto(292, 998, "O evento sai do app", 29, "700")
texto(292, 1034, "Só sai o que você declarou no catálogo.", 24, cor="#333")
mono(292, 1078, "POST /functions/v1/ingest")
mono(292, 1104, "x-api-key: ing_…")
mono(292, 1130, '{ "nome": "crm_lead_qualificado",')
mono(292, 1156, '  "distinct_id": "…", "tela": "Funil" }')
texto(292, 1190, "202. Reenviar o mesmo id não conta duas vezes.", 22, cor="#555", italico=True)
seta(505, 1209, 534, 1246, 24, curva=0.02)

# ----------------------------------------------------------- caixa central
caixa(850, 370, 580, 790, 41, larg=3.2)
texto(1140, 440, "App Visão de Produto", 42, "700", anc="middle")
texto(1140, 482, "Next.js na Vercel · app.visaodeproduto.com.br", 25, cor="#444", anc="middle")
add('<path d="M895 508 Q1140 503 1385 508" fill="none" stroke="%s" stroke-width="2.2"/>' % TINTA)

itens = [
 ("Catálogo", "é aqui que o evento vira dicionário: nome", "e descrição em português. O Claude lê isto"),
 ("Atividade e Uso", "o que acabou de chegar, e quanto cada", "evento ocorreu — inclusive o que deu zero"),
 ("Painel e Pessoas", "os gráficos que você fixou, e o histórico", "de cada pessoa que usou"),
 ("Configurações do produto", "chave de ingestão, prefixo dos nomes", "e fuso de exibição"),
 ("Credenciais MCP", "o token de leitura que liga o Claude", "a esta conta"),
 ("Rotinas diárias", "avisos por e-mail às 12:00 UTC, e a", "reconciliação da cobrança às 05:40 UTC"),
]
y = 556
for titulo, l1, l2 in itens:
    add('<circle cx="898" cy="%.1f" r="6" fill="%s"/>' % (y - 9, TINTA))
    texto(922, y, titulo, 28, "700")
    texto(922, y + 29, l1, 23, cor="#444")
    texto(922, y + 55, l2, 23, cor="#444")
    y += 100

# ------------------------------------------------------- direita: o dono
hP = tela_mac(1490, 355, 620, os.path.join(IMG, "painel.png"), 51)
texto(1800, 355 + hP + 42, "no navegador · Painel, com os gráficos que você fixou",
      25, anc="middle", italico=True, cor="#333")

hM = tela_mac(1520, 860, 560, os.path.join(IMG, "claude-mcp.png"), 52)
texto(1800, 860 + hM + 42, "no Claude · a mesma conta, pelo conector MCP",
      25, anc="middle", italico=True, cor="#333")

bonequinho(2290, 500)
linhas(2290, 700, ["Dono do produto", "entra com o Google,", "mapeia os eventos", "e lê de onde preferir"],
       25, 31, anc="middle", cor="#333")
seta(2248, 560, 2122, 520, 62, curva=0.06)
seta(2252, 846, 2092, 960, 64, curva=0.08)
seta(1434, 540, 1482, 500, 63, curva=0.05)
texto(1448, 452, "abre", 23, anc="middle", italico=True)
texto(1448, 476, "o painel", 23, anc="middle", italico=True)

# --------------------------------- a porta de entrada e a infraestrutura
caixa(300, 1250, 520, 130, 71)
texto(560, 1300, "api.visaodeproduto.com.br", 30, "700", anc="middle")
texto(560, 1336, "proxy na Vercel · a porta do ingest e do MCP", 23, cor="#444", anc="middle")
texto(560, 1362, "nenhum app precisa saber o endereço do banco", 21, cor="#777", anc="middle")

caixa(880, 1430, 680, 350, 81, larg=3.0)
texto(1220, 1490, "Supabase", 38, "700", anc="middle")
linhas(910, 1548, [
  "Postgres: contas, produtos, catálogo, pessoas, painéis",
  "eventos numa tabela particionada por semana",
  "Edge Functions: ingest (grava) e mcp (lê)",
  "pg_cron às 03:00 UTC: cria a partição da semana",
  "RLS em toda tabela e em toda partição",
], 24, 40, cor="#333")

seta(824, 1330, 874, 1480, 82, curva=0.05)
texto(790, 1430, "grava", 23, anc="middle", italico=True)
seta(1180, 1164, 1180, 1424, 83, curva=0.0)
texto(1248, 1300, "lê e grava", 24, italico=True)

caixa(1620, 1430, 320, 350, 91)
texto(1780, 1490, "Stripe", 34, "700", anc="middle")
linhas(1648, 1552, ["Assinatura do", "plano pago:", "R$ 50 por mês", "", "Webhook da", "cobrança"], 24, 37, cor="#333")

caixa(1990, 1430, 330, 350, 92)
texto(2155, 1490, "Bird", 34, "700", anc="middle")
linhas(2018, 1548, ["E-mails da conta:", "boas-vindas,", "cancelamento,", "teto de uso e", "falha de pagamento"], 24, 40, cor="#333")

seta(1340, 1164, 1655, 1424, 93, curva=0.18)
seta(1395, 1150, 2035, 1424, 94, curva=0.20)
seta(1527, 1180, 1550, 1424, 84, curva=0.06)

add('<path d="M820 1832 Q1230 1827 1640 1832" fill="none" stroke="%s" stroke-width="2"/>' % TINTA)
texto(1230, 1870, "Domínio visaodeproduto.com.br no registro.br · Um produto Dab Lab",
      25, anc="middle", cor="#333")
add("</svg>")

io.open(os.path.join(D, "diagrama.svg"), "w", encoding="utf-8").write("\n".join(saida))
print("svg gerado em", os.path.join(D, "diagrama.svg"))
