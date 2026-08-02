import { type CSSProperties, useCallback, useState } from "react";

import { ApiError, type PilotageMoi, type Session, getPilotageMoi } from "./api.js";
import { Login } from "./components/Login.js";
import { AssiduitePage, CollaborationPage, PerimetrePage, RapportsPage, TagsPage } from "./components/Pages.js";
import { Activites, Consultations, Membres, TableauBord } from "./components/Pilotage.js";
import { useMarque } from "./useMarque.js";
import { useResource } from "./useResource.js";

const SESSION_KEY = "adsum.pilotage.token";

function loadSession(): Session | null {
  try {
    const raw = window.localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<Session>;
    if (typeof parsed.token === "string" && parsed.token.length > 0) {
      return { token: parsed.token, role: typeof parsed.role === "string" ? parsed.role : "" };
    }
    return null;
  } catch {
    return null;
  }
}
function saveSession(s: Session): void {
  try {
    window.localStorage.setItem(SESSION_KEY, JSON.stringify(s));
  } catch {
    /* private mode */
  }
}
function clearSession(): void {
  try {
    window.localStorage.removeItem(SESSION_KEY);
  } catch {
    /* private mode */
  }
}

type PageId =
  | "bord"
  | "activites"
  | "consultations"
  | "membres"
  | "assiduite"
  | "tags"
  | "rapports"
  | "collaboration"
  | "perimetre";

const MENU: { id: PageId; label: string; icon: string }[] = [
  { id: "bord", label: "Tableau de bord", icon: "▤" },
  { id: "activites", label: "Activités", icon: "🗓" },
  { id: "consultations", label: "Consultations", icon: "🗳" },
  { id: "membres", label: "Membres", icon: "👥" },
  { id: "assiduite", label: "Assiduité", icon: "📈" },
  { id: "tags", label: "Tags", icon: "🏷" },
  { id: "rapports", label: "Rapports", icon: "📄" },
  { id: "collaboration", label: "Collaboration", icon: "🗂" },
  { id: "perimetre", label: "Mon périmètre", icon: "◎" },
];

export function App(): JSX.Element {
  const [session, setSession] = useState<Session | null>(() => loadSession());
  const onAuth = useCallback((s: Session) => {
    saveSession(s);
    setSession(s);
  }, []);
  const onLogout = useCallback(() => {
    clearSession();
    setSession(null);
  }, []);
  if (!session) return <Login onAuth={onAuth} />;
  return <Shell session={session} onLogout={onLogout} />;
}

function Shell({ session, onLogout }: { session: Session; onLogout: () => void }): JSX.Element {
  const marque = useMarque();
  const onExpired = useCallback(
    (err: unknown) => {
      if (err instanceof ApiError && err.status === 401) onLogout();
    },
    [onLogout],
  );
  const moi = useResource(() => getPilotageMoi(session.token), [session.token], onExpired);
  const [page, setPage] = useState<PageId>("bord");
  const [navOpen, setNavOpen] = useState(false);
  const current = MENU.find((m) => m.id === page);

  return (
    <div style={shell}>
      <aside style={navOpen ? { ...sidebar, ...sidebarOpenMobile } : sidebar}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "4px 6px 16px" }}>
          <span style={logo}>{marque.initiale}</span>
          <div style={{ lineHeight: 1.1 }}>
            <div style={{ fontWeight: 800, fontSize: 15 }}>{marque.marque}</div>
            <div style={{ fontSize: 11, color: "var(--adsum-muted,#8a8a94)" }}>Pilotage</div>
          </div>
        </div>
        {MENU.map((m) => (
          <button
            key={m.id}
            type="button"
            onClick={() => {
              setPage(m.id);
              setNavOpen(false);
            }}
            style={menuItem(page === m.id)}
          >
            <span style={{ width: 20, textAlign: "center" }}>{m.icon}</span>
            {m.label}
          </button>
        ))}
        <div style={{ flex: 1 }} />
        <button type="button" onClick={onLogout} style={{ ...menuItem(false), color: "var(--adsum-danger,#c0392b)" }}>
          <span style={{ width: 20, textAlign: "center" }}>⏻</span>Déconnexion
        </button>
      </aside>

      <main style={content}>
        <header style={mobileBar}>
          <button type="button" onClick={() => setNavOpen((v) => !v)} style={burger} aria-label="Menu">
            ☰
          </button>
          <span style={{ fontWeight: 700 }}>{current?.label}</span>
        </header>
        <div className="main-scroll">
          <div className="page">
            {moi.error && !moi.data ? (
              <p className="banner banner-error">{moi.error}</p>
            ) : !moi.data ? (
              <p className="muted">Chargement...</p>
            ) : (
              <>
                <header className="page-head">
                  <div>
                    <h1>{current?.label}</h1>
                    <p className="muted">
                      {moi.data.global
                        ? "Supervision globale"
                        : `Périmètre : ${moi.data.coordinations} coordination(s), ${moi.data.intendances} intendance(s), ${moi.data.membres_perimetre} membre(s)`}
                    </p>
                  </div>
                </header>
                {renderPage(page, session.token, moi.data)}
              </>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

function renderPage(page: PageId, token: string, moi: PilotageMoi): JSX.Element {
  switch (page) {
    case "bord":
      return <TableauBord token={token} />;
    case "activites":
      return <Activites token={token} moi={moi} />;
    case "consultations":
      return <Consultations token={token} moi={moi} />;
    case "membres":
      return <Membres token={token} />;
    case "assiduite":
      return <AssiduitePage token={token} />;
    case "tags":
      return <TagsPage token={token} />;
    case "rapports":
      return <RapportsPage token={token} />;
    case "collaboration":
      return <CollaborationPage />;
    case "perimetre":
      return <PerimetrePage token={token} moi={moi} />;
  }
}

const shell: CSSProperties = { display: "flex", minHeight: "100vh", background: "var(--adsum-bg, #f6f7fb)" };
const sidebar: CSSProperties = {
  width: 232,
  flexShrink: 0,
  background: "var(--adsum-surface, #fff)",
  borderRight: "1px solid var(--adsum-border, #e6e6ee)",
  padding: 14,
  display: "flex",
  flexDirection: "column",
  gap: 2,
  position: "sticky",
  top: 0,
  height: "100vh",
};
const sidebarOpenMobile: CSSProperties = {};
const content: CSSProperties = { flex: 1, minWidth: 0, display: "flex", flexDirection: "column" };
const logo: CSSProperties = {
  width: 34,
  height: 34,
  borderRadius: 9,
  background: "var(--adsum-accent, #4f46e5)",
  color: "#fff",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontWeight: 800,
};
const mobileBar: CSSProperties = { display: "none" };
const burger: CSSProperties = { background: "transparent", border: "none", fontSize: 20, cursor: "pointer" };

function menuItem(active: boolean): CSSProperties {
  return {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "10px 12px",
    borderRadius: 10,
    border: "none",
    background: active ? "#eef2fb" : "transparent",
    color: active ? "var(--adsum-accent, #4f46e5)" : "var(--adsum-ink, #22222a)",
    fontWeight: active ? 700 : 500,
    fontSize: 14,
    cursor: "pointer",
    textAlign: "left",
    width: "100%",
  };
}
