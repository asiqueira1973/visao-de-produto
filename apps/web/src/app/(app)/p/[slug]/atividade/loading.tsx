/**
 * Carregamento da tela de Atividade.
 *
 * O que faz: desenha o esqueleto das linhas enquanto os eventos não chegam.
 * Implementa: o critério do épico 8.4 — estado de carregamento usa skeleton,
 *             nunca spinner de tela cheia.
 */

const LARGURAS = [70, 58, 80, 64, 74, 52, 68, 60, 76];

export default function Carregando() {
  return (
    <div style={{ flex: 1, padding: "26px 32px 40px" }}>
      <div style={{ fontSize: 19, fontWeight: 600, letterSpacing: "-0.01em" }}>Atividade</div>
      <div style={{ marginTop: 24 }}>
        {LARGURAS.map((largura, indice) => (
          <div
            key={indice}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 16,
              padding: "11px 2px",
              borderBottom: "1px solid var(--line)",
              animation: "sk 1.4s ease-in-out infinite",
              animationDelay: `${indice * 0.08}s`,
            }}
          >
            <div style={{ flex: 1 }}>
              <div
                style={{
                  height: 9,
                  borderRadius: 4,
                  background: "var(--line2)",
                  width: `${largura}%`,
                }}
              />
              <div
                style={{
                  height: 8,
                  borderRadius: 4,
                  background: "var(--line)",
                  width: 170,
                  marginTop: 7,
                }}
              />
            </div>
            <div style={{ height: 8, width: 60, borderRadius: 4, background: "var(--line)" }} />
          </div>
        ))}
      </div>
    </div>
  );
}
