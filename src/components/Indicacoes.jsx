import { useEffect, useMemo, useState } from "react";
import {
  FaChartLine,
  FaCheck,
  FaCheckCircle,
  FaClock,
  FaCopy,
  FaGift,
  FaSignOutAlt,
  FaTrophy,
  FaUserCheck,
  FaUserFriends,
  FaWhatsapp,
} from "react-icons/fa";
import {
  cadastrarCliente,
  entrarCliente,
  observarAutenticacao,
  observarEquipe,
  observarIndicacoes,
  observarPendentes,
  observarPerfil,
  recuperarSenha,
  sairCliente,
  solicitarBeneficio,
  validarCompra,
} from "../services/clubeBussola";
import { firebaseConfigurado } from "../services/firebase";
import "./indicacoes.css";

// Níveis do Clube Bússola. Alterar as metas aqui atualiza todo o painel.
const NIVEIS = [
  { nome: "Explorador", minimo: 0, proximo: 5 },
  { nome: "Navegador", minimo: 5, proximo: 10 },
  { nome: "Capitão", minimo: 10, proximo: 15 },
  { nome: "Comandante", minimo: 15, proximo: 20 },
  { nome: "Embaixador", minimo: 20, proximo: null },
];

// Recompensas exibidas para o cliente conforme as indicações validadas.
const RECOMPENSAS = [
  { meta: 3, premio: "Brinde especial" },
  { meta: 5, premio: "10% de benefício" },
  { meta: 10, premio: "20% de benefício" },
  { meta: 15, premio: "Presente especial" },
  { meta: 20, premio: "Embaixador Bússola" },
];

// Dados usados apenas quando o Firebase ainda não está configurado.
const INDICACOES_DEMO = [
  { nomeIndicado: "Maria S.", status: "comprou", criadoEm: "22 jun" },
  { nomeIndicado: "Pedro A.", status: "cadastrado", criadoEm: "21 jun" },
  { nomeIndicado: "Ana C.", status: "comprou", criadoEm: "18 jun" },
  { nomeIndicado: "Carlos M.", status: "comprou", criadoEm: "15 jun" },
  { nomeIndicado: "Lia F.", status: "comprou", criadoEm: "13 jun" },
  { nomeIndicado: "Rafa P.", status: "comprou", criadoEm: "10 jun" },
  { nomeIndicado: "Bia L.", status: "comprou", criadoEm: "08 jun" },
  { nomeIndicado: "Noemi R.", status: "comprou", criadoEm: "06 jun" },
];

const PENDENTES_DEMO = [
  { id: "demo-1", nomeIndicado: "Pedro A.", nomeOrigem: "João", criadoEm: "21 jun" },
  { id: "demo-2", nomeIndicado: "Clara N.", nomeOrigem: "Marina", criadoEm: "19 jun" },
];

// Acessos de apresentacao. Eles so funcionam quando o Firebase ainda nao foi
// configurado, por isso nao substituem as contas reais da equipe.
const ACESSOS_DEMO = {
  cliente: {
    email: "cliente@bussola.com.br",
    senha: "cliente2026",
  },
  atendimento: {
    email: "atendimento@bussola.com.br",
    senha: "bussola2026",
  },
};

const FORMULARIO_INICIAL = {
  nome: "",
  whatsapp: "",
  cidade: "",
  email: "",
  senha: "",
  codigoRecebido: "",
};

function calcularEvolucao(totalValidas) {
  const nivelAtual =
    [...NIVEIS].reverse().find((nivel) => totalValidas >= nivel.minimo) ||
    NIVEIS[0];
  const proximoNivel = NIVEIS.find((nivel) => nivel.minimo === nivelAtual.proximo);
  const faltam = nivelAtual.proximo
    ? Math.max(nivelAtual.proximo - totalValidas, 0)
    : 0;
  const base = nivelAtual.minimo;
  const teto = nivelAtual.proximo || totalValidas || 1;
  const progresso = nivelAtual.proximo
    ? Math.min(((totalValidas - base) / (teto - base)) * 100, 100)
    : 100;

  return { nivelAtual, proximoNivel, faltam, progresso };
}

function traduzirErro(error) {
  const codigo = error?.code || "";

  if (codigo.includes("email-already-in-use")) return "Este email já está cadastrado.";
  if (codigo.includes("invalid-email")) return "Confira o email informado.";
  if (codigo.includes("weak-password")) return "Use uma senha com pelo menos 6 caracteres.";
  if (codigo.includes("invalid-credential")) return "Email ou senha incorretos.";

  return error?.message || "Não foi possível concluir a ação agora.";
}

function formatarData(indicacao) {
  const data = indicacao.criadoEm?.toDate?.();
  if (data) {
    return new Intl.DateTimeFormat("pt-BR", {
      day: "2-digit",
      month: "short",
    }).format(data);
  }

  return indicacao.criadoEm || "Agora";
}

export default function Indicacoes() {
  const [usuario, setUsuario] = useState(null);
  const [perfil, setPerfil] = useState(null);
  const [roleEquipe, setRoleEquipe] = useState("");
  const [indicacoes, setIndicacoes] = useState([]);
  const [pendentes, setPendentes] = useState([]);
  const [carregando, setCarregando] = useState(firebaseConfigurado);
  const [modoCadastro, setModoCadastro] = useState(true);
  const [formulario, setFormulario] = useState(FORMULARIO_INICIAL);
  const [mensagem, setMensagem] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [abaAtiva, setAbaAtiva] = useState("resumo");
  const [copiado, setCopiado] = useState(false);

  useEffect(() => {
    const parametros = new URLSearchParams(window.location.search);
    const codigoRecebido = parametros.get("ref") || "";

    if (codigoRecebido) {
      setFormulario((atual) => ({
        ...atual,
        codigoRecebido: codigoRecebido.toUpperCase(),
      }));
      setModoCadastro(true);
    }
  }, []);

  useEffect(() => {
    if (!firebaseConfigurado) {
      setCarregando(false);
      return undefined;
    }

    // O Firebase avisa quando o cliente entra ou sai da conta.
    const pararAutenticacao = observarAutenticacao((clienteAtual) => {
      setUsuario(clienteAtual);
      setPerfil(null);
      setIndicacoes([]);
      setRoleEquipe("");

      if (!clienteAtual) {
        setCarregando(false);
      }
    });

    return pararAutenticacao;
  }, []);

  useEffect(() => {
    if (!usuario || !firebaseConfigurado) return undefined;

    setCarregando(true);

    // Perfil, indicações e permissão de equipe ficam em ouvintes separados.
    const pararPerfil = observarPerfil(usuario.uid, (dadosPerfil) => {
      setPerfil(dadosPerfil);
      setCarregando(false);
    });
    const pararIndicacoes = observarIndicacoes(usuario.uid, setIndicacoes);
    const pararEquipe = observarEquipe(usuario.uid, (equipe) => {
      setRoleEquipe(equipe?.role || "");
      if (equipe?.role) setAbaAtiva("validar");
    });

    return () => {
      pararPerfil();
      pararIndicacoes();
      pararEquipe();
    };
  }, [usuario]);

  useEffect(() => {
    if (!roleEquipe || !firebaseConfigurado) {
      setPendentes([]);
      return undefined;
    }

    return observarPendentes(setPendentes);
  }, [roleEquipe]);

  const indicacoesValidas = indicacoes.filter((item) => item.status === "comprou");
  const totalValidas = indicacoesValidas.length;
  const evolucao = calcularEvolucao(totalValidas);
  const codigoIndicacao = perfil?.codigoIndicacao || "JOAO315";
  const linkIndicacao = `${window.location.origin}/?ref=${codigoIndicacao}#indicacoes`;

  const mensagemWhatsApp = useMemo(
    () =>
      encodeURIComponent(
        `Olá! Sou cliente da Bússola Cosméticos & Acessórios. Use meu código ${codigoIndicacao} e ganhe benefícios na sua primeira compra. Acesse: ${linkIndicacao}`,
      ),
    [codigoIndicacao, linkIndicacao],
  );

  function atualizarCampo(campo, valor) {
    setFormulario((atual) => ({ ...atual, [campo]: valor }));
  }

  async function enviarAcesso(event) {
    event.preventDefault();
    setMensagem("");
    setEnviando(true);

    try {
      if (!firebaseConfigurado) {
        const email = formulario.email.trim().toLowerCase();

        if (modoCadastro) {
          entrarDemonstracao("", formulario.nome || "Cliente");
          setMensagem("Cadastro demonstrativo criado. No Firebase, ele será salvo de verdade.");
          return;
        }

        if (
          email === ACESSOS_DEMO.atendimento.email &&
          formulario.senha === ACESSOS_DEMO.atendimento.senha
        ) {
          entrarDemonstracao("atendente", "Atendimento");
          return;
        }

        if (
          email === ACESSOS_DEMO.cliente.email &&
          formulario.senha === ACESSOS_DEMO.cliente.senha
        ) {
          entrarDemonstracao();
          return;
        }

        setMensagem("Use um dos acessos de teste informados abaixo do formulário.");
        return;
      }

      if (modoCadastro) {
        await cadastrarCliente(formulario);
        setMensagem("Cadastro criado. Seu código já está disponível no painel.");
      } else {
        await entrarCliente(formulario.email, formulario.senha);
      }
    } catch (error) {
      setMensagem(traduzirErro(error));
    } finally {
      setEnviando(false);
    }
  }

  function entrarDemonstracao(role = "", nome = "João") {
    const indicacoesDemo = role ? [] : INDICACOES_DEMO;
    setUsuario({ uid: role ? "atendimento-demo" : "cliente-demo" });
    setPerfil({
      nome,
      email: role ? "atendimento@bussola.com.br" : "joao@email.com",
      whatsapp: "85 98424-1536",
      cidade: "Fortaleza",
      codigoIndicacao: role ? "ATENDIMENTO" : "JOAO315",
    });
    setRoleEquipe(role);
    setIndicacoes(indicacoesDemo);
    setPendentes(role ? PENDENTES_DEMO : []);
    setAbaAtiva(role ? "validar" : "resumo");
    setMensagem("Modo demonstração ativo. Com Firebase configurado, estes dados ficam reais.");
  }

  async function sair() {
    if (firebaseConfigurado && usuario?.uid && usuario.uid !== "cliente-demo") {
      await sairCliente();
    }

    setUsuario(null);
    setPerfil(null);
    setIndicacoes([]);
    setPendentes([]);
    setRoleEquipe("");
    setAbaAtiva("resumo");
    setMensagem("");
  }

  async function enviarRecuperacao() {
    setMensagem("");

    try {
      await recuperarSenha(formulario.email);
      setMensagem("Enviamos um email para redefinir a senha.");
    } catch (error) {
      setMensagem(traduzirErro(error));
    }
  }

  async function copiarCodigo() {
    try {
      await navigator.clipboard.writeText(codigoIndicacao);
      setCopiado(true);
      window.setTimeout(() => setCopiado(false), 1800);
    } catch {
      setMensagem("Não foi possível copiar automaticamente.");
    }
  }

  async function pedirBeneficio(recompensa) {
    if (!firebaseConfigurado || usuario?.uid === "cliente-demo") {
      setMensagem(`Benefício solicitado: ${recompensa.premio}.`);
      return;
    }

    await solicitarBeneficio(usuario.uid, recompensa);
    setMensagem("Solicitação enviada para a equipe da Bússola.");
  }

  async function confirmarCompra(indicacaoId) {
    if (!firebaseConfigurado || usuario?.uid === "atendimento-demo") {
      setPendentes((atuais) => atuais.filter((item) => item.id !== indicacaoId));
      setMensagem("Compra validada na demonstração.");
      return;
    }

    await validarCompra(indicacaoId, usuario.uid);
    setMensagem("Compra validada. O ponto entrou para o cliente indicador.");
  }

  if (carregando) {
    return (
      <section className="indicacoes" id="indicacoes">
        <div className="indicacoes-carregando">Carregando Clube Bússola...</div>
      </section>
    );
  }

  if (!perfil) {
    return (
      <section className="indicacoes" id="indicacoes">
        <div className="indicacoes-intro">
          <div>
            <span className="indicacoes-kicker">Clube Bússola</span>
            <h2>Entre no clube e acompanhe suas indicações.</h2>
            <p>
              O cliente cria sua conta, recebe um código próprio e acompanha
              pontos, benefícios e evolução de nível.
            </p>
          </div>
        </div>

        <div className="clube-acesso">
          <div className="clube-acesso-texto">
            <span>Como funciona</span>
            <h3>Cadastro primeiro, ponto só depois da compra.</h3>
            <p>
              Quando uma pessoa indicada compra, a equipe valida a venda e o
              ponto aparece no painel do cliente que indicou.
            </p>
          </div>

          <form className="clube-acesso-form" onSubmit={enviarAcesso}>
            <h3>{modoCadastro ? "Criar cadastro" : "Entrar no clube"}</h3>

            {modoCadastro && (
              <>
                <label>
                  Nome
                  <input
                    type="text"
                    value={formulario.nome}
                    onChange={(event) => atualizarCampo("nome", event.target.value)}
                    required
                  />
                </label>
                <label>
                  WhatsApp
                  <input
                    type="tel"
                    value={formulario.whatsapp}
                    onChange={(event) =>
                      atualizarCampo("whatsapp", event.target.value)
                    }
                    required
                  />
                </label>
                <label>
                  Cidade
                  <input
                    type="text"
                    value={formulario.cidade}
                    onChange={(event) =>
                      atualizarCampo("cidade", event.target.value)
                    }
                  />
                </label>
              </>
            )}

            <label>
              Email
              <input
                type="email"
                value={formulario.email}
                onChange={(event) => atualizarCampo("email", event.target.value)}
                required
              />
            </label>
            <label>
              Senha
              <input
                type="password"
                value={formulario.senha}
                onChange={(event) => atualizarCampo("senha", event.target.value)}
                required
                minLength={6}
              />
            </label>

            {modoCadastro && (
              <label>
                Código de quem indicou
                <input
                  type="text"
                  value={formulario.codigoRecebido}
                  onChange={(event) =>
                    atualizarCampo("codigoRecebido", event.target.value)
                  }
                  placeholder="Opcional"
                />
              </label>
            )}

            {mensagem && <p className="clube-mensagem">{mensagem}</p>}

            <button className="clube-botao-principal" type="submit" disabled={enviando}>
              {enviando ? "Aguarde..." : modoCadastro ? "Quero meu benefício" : "Entrar"}
            </button>

            {!modoCadastro && (
              <button className="clube-link" type="button" onClick={enviarRecuperacao}>
                Esqueci minha senha
              </button>
            )}

            <button
              className="clube-link"
              type="button"
              onClick={() => setModoCadastro((atual) => !atual)}
            >
              {modoCadastro ? "Já tenho cadastro" : "Criar cadastro"}
            </button>

            {!firebaseConfigurado && (
              <div className="clube-demo-acoes">
                <p>
                  Teste cliente: {ACESSOS_DEMO.cliente.email} / {ACESSOS_DEMO.cliente.senha}
                </p>
                <p>
                  Teste atendimento: {ACESSOS_DEMO.atendimento.email} /{" "}
                  {ACESSOS_DEMO.atendimento.senha}
                </p>
                <button type="button" onClick={() => entrarDemonstracao()}>
                  Ver como cliente
                </button>
                <button
                  type="button"
                  onClick={() => entrarDemonstracao("atendente", "Atendimento")}
                >
                  Ver atendimento
                </button>
              </div>
            )}
          </form>
        </div>
      </section>
    );
  }

  const menuCliente = [
    { id: "resumo", texto: "Resumo", icone: <FaChartLine /> },
    { id: "indicados", texto: "Indicações", icone: <FaUserFriends /> },
    { id: "recompensas", texto: "Benefícios", icone: <FaGift /> },
  ];
  const menuEquipe = [{ id: "validar", texto: "Validar compras", icone: <FaUserCheck /> }];
  const menu = roleEquipe ? menuEquipe : menuCliente;

  return (
    <section className="indicacoes" id="indicacoes">
      <div className="indicacoes-intro">
        <div>
          <span className="indicacoes-kicker">Clube Bússola</span>
          <h2>Olá, {perfil.nome?.split(" ")[0]}.</h2>
          <p>
            Bem-vindo ao painel de indicações, cashback e recompensas da Bússola.
          </p>
        </div>

        <div className="indicacoes-identidade">
          <span>{roleEquipe ? "Perfil da equipe" : "Nível atual"}</span>
          <strong>{roleEquipe ? roleEquipe : evolucao.nivelAtual.nome}</strong>
        </div>
      </div>

      <div className="indicacoes-app">
        <nav className="indicacoes-menu" aria-label="Área de indicações">
          {menu.map((item) => (
            <button
              type="button"
              className={abaAtiva === item.id ? "ativo" : ""}
              onClick={() => setAbaAtiva(item.id)}
              key={item.id}
            >
              {item.icone}
              {item.texto}
            </button>
          ))}
          <button type="button" onClick={sair}>
            <FaSignOutAlt />
            Sair
          </button>
        </nav>

        <main className="indicacoes-conteudo">
          {mensagem && <p className="clube-mensagem-painel">{mensagem}</p>}

          {abaAtiva === "resumo" && !roleEquipe && (
            <>
              <div className="indicacoes-resumo">
                <div>
                  <span>Indicações válidas</span>
                  <strong>{totalValidas}</strong>
                </div>
                <div>
                  <span>Nível atual</span>
                  <strong>{evolucao.nivelAtual.nome}</strong>
                </div>
                <div>
                  <span>Próximo nível</span>
                  <strong>{evolucao.proximoNivel?.nome || "Topo"}</strong>
                </div>
              </div>

              <div className="indicacoes-progresso">
                <div className="indicacoes-progresso-topo">
                  <span>Progresso</span>
                  <strong>
                    {evolucao.proximoNivel
                      ? `Faltam ${evolucao.faltam} indicações`
                      : "Você chegou ao nível máximo"}
                  </strong>
                </div>
                <div className="indicacoes-barra">
                  <span style={{ width: `${evolucao.progresso}%` }} />
                </div>
              </div>

              <div className="indicacoes-compartilhar">
                <div>
                  <span>Seu código de indicação</span>
                  <strong>{codigoIndicacao}</strong>
                  <small>{linkIndicacao}</small>
                </div>

                <div className="indicacoes-acoes">
                  <button type="button" onClick={copiarCodigo}>
                    {copiado ? <FaCheck /> : <FaCopy />}
                    {copiado ? "Código copiado" : "Copiar código"}
                  </button>
                  <a
                    href={`https://wa.me/?text=${mensagemWhatsApp}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <FaWhatsapp />
                    Compartilhar
                  </a>
                </div>
              </div>
            </>
          )}

          {abaAtiva === "indicados" && !roleEquipe && (
            <div className="indicacoes-painel">
              <div className="indicacoes-painel-titulo">
                <div>
                  <span>Histórico</span>
                  <h3>Suas indicações</h3>
                </div>
                <strong>{totalValidas} válidas</strong>
              </div>

              <div className="indicacoes-lista">
                {indicacoes.length === 0 && (
                  <p className="clube-lista-vazia">Nenhuma indicação registrada ainda.</p>
                )}
                {indicacoes.map((indicacao) => {
                  const validada = indicacao.status === "comprou";

                  return (
                    <div className="indicacao-linha" key={indicacao.id || indicacao.nomeIndicado}>
                      <span className="indicacao-avatar">
                        {(indicacao.nomeIndicado || "C").charAt(0)}
                      </span>
                      <div>
                        <strong>{indicacao.nomeIndicado || "Cliente indicado"}</strong>
                        <small>{formatarData(indicacao)}</small>
                      </div>
                      <span className={`indicacao-status ${validada ? "validada" : "pendente"}`}>
                        {validada ? <FaCheckCircle /> : <FaClock />}
                        {validada ? "Compra validada" : "Aguardando compra"}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {abaAtiva === "recompensas" && !roleEquipe && (
            <div className="indicacoes-painel">
              <div className="indicacoes-painel-titulo">
                <div>
                  <span>Trilha de benefícios</span>
                  <h3>Suas recompensas</h3>
                </div>
                <FaTrophy />
              </div>

              <div className="recompensas-lista-indicacoes">
                {RECOMPENSAS.map((recompensa) => {
                  const liberada = totalValidas >= recompensa.meta;

                  return (
                    <div className={liberada ? "liberada" : "bloqueada"} key={recompensa.meta}>
                      <span>{recompensa.meta}</span>
                      <div>
                        <strong>{recompensa.premio}</strong>
                        <small>{recompensa.meta} indicações válidas</small>
                      </div>
                      {liberada ? (
                        <button type="button" onClick={() => pedirBeneficio(recompensa)}>
                          Utilizar
                        </button>
                      ) : (
                        <FaClock aria-label="Bloqueada" />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {abaAtiva === "validar" && roleEquipe && (
            <div className="indicacoes-painel">
              <div className="indicacoes-painel-titulo">
                <div>
                  <span>Atendimento</span>
                  <h3>Compras para validar</h3>
                </div>
                <strong>{pendentes.length} pendentes</strong>
              </div>

              <div className="indicacoes-lista">
                {pendentes.length === 0 && (
                  <p className="clube-lista-vazia">Nenhuma indicação aguardando compra.</p>
                )}
                {pendentes.map((indicacao) => (
                  <div className="indicacao-linha indicacao-linha-equipe" key={indicacao.id}>
                    <span className="indicacao-avatar">
                      {(indicacao.nomeIndicado || "C").charAt(0)}
                    </span>
                    <div>
                      <strong>{indicacao.nomeIndicado || "Cliente indicado"}</strong>
                      <small>
                        Indicado por {indicacao.nomeOrigem || "cliente"} -{" "}
                        {formatarData(indicacao)}
                      </small>
                    </div>
                    <button type="button" onClick={() => confirmarCompra(indicacao.id)}>
                      Validar compra
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </main>
      </div>
    </section>
  );
}
