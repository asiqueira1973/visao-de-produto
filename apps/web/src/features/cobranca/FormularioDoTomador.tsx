"use client";

/**
 * O formulário dos dados da nota fiscal.
 *
 * O que faz: pergunta se o tomador é pessoa física ou jurídica e pede só o que
 *            a nota daquele tipo exige, preenchendo o resto por consulta.
 * Recebe:    o que já estiver guardado, quando a pessoa volta para editar.
 * Devolve:   o formulário da tela de assinatura.
 * Implementa: EPICO-COBRANCA.md, seção 5 — os campos obrigatórios saíram do
 *             formulário real da Contabilizei.
 *
 * Pessoa física pede dois campos. Pessoa jurídica pediria oito, e oito campos
 * entre a pessoa e o pagamento é onde carrinho morre — por isso o CNPJ preenche
 * razão social e endereço sozinho, e o CEP preenche o resto. Sobra o número.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { consultarCep, consultarCnpj, salvarDadosDeCobranca, type DadosDoTomador } from "./acoes";

const VAZIO: DadosDoTomador = {
  tipo: "pf",
  documento: "",
  nome: "",
  email_nota: "",
  cep: "",
  logradouro: "",
  numero: "",
  complemento: "",
  bairro: "",
  municipio: "",
  uf: "",
};

const campo: React.CSSProperties = {
  height: 34,
  padding: "0 10px",
  borderRadius: 7,
  border: "1px solid var(--line)",
  background: "var(--elev)",
  fontSize: 13,
  outline: "none",
  width: "100%",
};

const rotulo: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 5,
  fontSize: 11.5,
  color: "var(--faint)",
  minWidth: 0,
};

function Campo({
  nome,
  valor,
  onChange,
  onBlur,
  largura,
  placeholder,
  obrigatorio,
}: {
  nome: string;
  valor: string;
  onChange: (v: string) => void;
  onBlur?: () => void;
  largura?: string;
  placeholder?: string;
  obrigatorio?: boolean;
}) {
  return (
    <label style={{ ...rotulo, gridColumn: largura }}>
      <span>
        {nome}
        {obrigatorio && <span style={{ color: "var(--err)" }}> *</span>}
      </span>
      <input
        value={valor}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        placeholder={placeholder}
        aria-label={nome}
        style={campo}
      />
    </label>
  );
}

export function FormularioDoTomador({
  inicial,
  aoSalvar,
}: {
  inicial?: Partial<DadosDoTomador> | null;
  /** Chamado depois de salvar; é quem leva para o pagamento. */
  aoSalvar?: () => void;
}) {
  const router = useRouter();
  const [dados, setDados] = useState<DadosDoTomador>({ ...VAZIO, ...(inicial ?? {}) });
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [consultando, setConsultando] = useState<"cnpj" | "cep" | null>(null);
  const [pendente, iniciarTransicao] = useTransition();

  const ehPj = dados.tipo === "pj";

  function mudar(campo: keyof DadosDoTomador, valor: string) {
    setDados((d) => ({ ...d, [campo]: valor }));
  }

  /** Sai do campo de CNPJ preenchido: busca razão social e endereço. */
  async function aoSairDoCnpj() {
    if (!ehPj || dados.documento.replace(/\D/g, "").length !== 14) return;
    setConsultando("cnpj");
    setAviso(null);
    const empresa = await consultarCnpj(dados.documento);
    setConsultando(null);

    if (!empresa) {
      setAviso("Não consegui consultar este CNPJ. Você pode preencher à mão.");
      return;
    }
    setDados((d) => ({
      ...d,
      nome: d.nome || empresa.razaoSocial,
      cep: d.cep || empresa.cep || "",
      logradouro: d.logradouro || empresa.logradouro || "",
      numero: d.numero || empresa.numero || "",
      bairro: d.bairro || empresa.bairro || "",
      municipio: d.municipio || empresa.municipio || "",
      uf: d.uf || empresa.uf || "",
    }));
  }

  /** Sai do campo de CEP preenchido: completa o endereço. */
  async function aoSairDoCep() {
    if (!ehPj || (dados.cep ?? "").replace(/\D/g, "").length !== 8) return;
    setConsultando("cep");
    const endereco = await consultarCep(dados.cep!);
    setConsultando(null);

    if (!endereco) {
      setAviso("Não consegui consultar este CEP. Você pode preencher à mão.");
      return;
    }
    setDados((d) => ({
      ...d,
      logradouro: endereco.logradouro || d.logradouro,
      bairro: endereco.bairro || d.bairro,
      municipio: endereco.municipio,
      uf: endereco.uf,
    }));
  }

  function salvar() {
    setErro(null);
    iniciarTransicao(async () => {
      const { erro: falha } = await salvarDadosDeCobranca(dados);
      if (falha) {
        setErro(falha);
        return;
      }
      router.refresh();
      aoSalvar?.();
    });
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {/* Quem é o tomador decide tudo o que vem depois. */}
      <div>
        <div style={{ fontSize: 11.5, color: "var(--faint)", marginBottom: 7 }}>
          A nota fiscal sai em nome de
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {(["pf", "pj"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setDados((d) => ({ ...d, tipo: t }))}
              style={{
                height: 32,
                padding: "0 14px",
                borderRadius: 7,
                fontSize: 12.5,
                cursor: "pointer",
                border: `1px solid ${dados.tipo === t ? "var(--pri)" : "var(--line)"}`,
                background: dados.tipo === t ? "var(--priSoft)" : "var(--elev)",
                color: dados.tipo === t ? "var(--pri)" : "var(--dim)",
              }}
            >
              {t === "pf" ? "Pessoa física" : "Empresa"}
            </button>
          ))}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 12 }}>
        <Campo
          nome={ehPj ? "CNPJ" : "CPF"}
          valor={dados.documento}
          onChange={(v) => mudar("documento", v)}
          onBlur={aoSairDoCnpj}
          placeholder={ehPj ? "00.000.000/0000-00" : "000.000.000-00"}
          largura="span 3"
          obrigatorio
        />
        <Campo
          nome={ehPj ? "Razão social" : "Nome completo"}
          valor={dados.nome}
          onChange={(v) => mudar("nome", v)}
          largura="span 3"
          obrigatorio
        />

        {ehPj && (
          <>
            <Campo
              nome="CEP"
              valor={dados.cep ?? ""}
              onChange={(v) => mudar("cep", v)}
              onBlur={aoSairDoCep}
              placeholder="00000-000"
              largura="span 2"
              obrigatorio
            />
            <Campo
              nome="Endereço"
              valor={dados.logradouro ?? ""}
              onChange={(v) => mudar("logradouro", v)}
              largura="span 3"
              obrigatorio
            />
            <Campo
              nome="Número"
              valor={dados.numero ?? ""}
              onChange={(v) => mudar("numero", v)}
              largura="span 1"
              obrigatorio
            />
            <Campo
              nome="Complemento"
              valor={dados.complemento ?? ""}
              onChange={(v) => mudar("complemento", v)}
              largura="span 2"
            />
            <Campo
              nome="Bairro"
              valor={dados.bairro ?? ""}
              onChange={(v) => mudar("bairro", v)}
              largura="span 2"
              obrigatorio
            />
            <Campo
              nome="Município"
              valor={dados.municipio ?? ""}
              onChange={(v) => mudar("municipio", v)}
              largura="span 1"
              obrigatorio
            />
            <Campo
              nome="UF"
              valor={dados.uf ?? ""}
              onChange={(v) => mudar("uf", v.toUpperCase().slice(0, 2))}
              largura="span 1"
              obrigatorio
            />
          </>
        )}

        <Campo
          nome="E-mail para a nota"
          valor={dados.email_nota ?? ""}
          onChange={(v) => mudar("email_nota", v)}
          placeholder="deixe vazio para usar o e-mail da conta"
          largura="span 6"
        />
      </div>

      {consultando && (
        <div style={{ fontSize: 11.5, color: "var(--faint)" }}>
          Consultando {consultando === "cnpj" ? "o CNPJ" : "o CEP"}…
        </div>
      )}
      {aviso && <div style={{ fontSize: 12, color: "var(--dim)" }}>{aviso}</div>}
      {erro && <div style={{ fontSize: 12.5, color: "var(--err)" }}>{erro}</div>}

      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <button
          onClick={salvar}
          disabled={pendente}
          style={{
            height: 34,
            padding: "0 16px",
            borderRadius: 7,
            border: "1px solid var(--pri)",
            background: "var(--pri)",
            color: "#fff",
            fontSize: 13,
            fontWeight: 500,
            cursor: "pointer",
          }}
        >
          {pendente ? "Salvando…" : "Salvar e continuar"}
        </button>
        <span style={{ fontSize: 11.5, color: "var(--faint)", lineHeight: 1.5 }}>
          {ehPj
            ? "Preencha o CNPJ e o CEP: o resto vem preenchido."
            : "Para pessoa física, a nota precisa só destes dois campos."}
        </span>
      </div>
    </div>
  );
}
