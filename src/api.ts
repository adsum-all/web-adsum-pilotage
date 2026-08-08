// Thin read-only client for the ADSUM API, used by the direction dashboard.
// The direction role has read access to the aggregated statistics endpoint.

const BASE = (import.meta.env.VITE_API_URL as string | undefined) ?? "https://adsum-api.vercel.app";

export type Role = "direction" | "admin" | "super_admin" | string;

export interface Session {
  token: string;
  role: Role;
}

export interface Statistiques {
  membres_total: number;
  membres_actifs: number;
  membres_verifies: number;
  membres_en_attente: number;
  evenements_total: number;
  presences_total: number;
  commissions_total: number;
  missions_total: number;
  intendances_total: number;
  par_commission: { commission: string; total: number }[];
  par_cheminement: { cheminement: string; total: number }[];
  entrees_mensuelles: { mois: string; total: number }[];
  membres_a_verifier: { id: string; matricule: string; prenoms: string | null; nom: string | null }[];
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

export function deviceId(): string {
  if (typeof localStorage === "undefined") return "";
  let id = localStorage.getItem("adsum.device.id");
  if (!id) {
    id = typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : `dev-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    localStorage.setItem("adsum.device.id", id);
  }
  return id;
}

export interface LoginResult {
  otpRequired: boolean;
  session: Session | null;
  canal: string | null;
  /** Why the mailbox refused our last messages, when it did. Null otherwise. */
  alerteEmail: string | null;
}

function loginError(status: number): ApiError {
  if (status === 401) return new ApiError("Identifiants invalides ou mot de passe temporaire expiré", status);
  if (status === 429) return new ApiError("Trop de tentatives. Patientez quelques minutes, puis réessayez.", status);
  if (status === 400) return new ApiError("Code incorrect ou expiré. Vérifiez et réessayez.", status);
  return new ApiError("Service momentanément indisponible.", status);
}

export async function login(email: string, password: string): Promise<LoginResult> {
  const res = await fetch(`${BASE}/api/v1/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Device-Id": deviceId() },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) throw loginError(res.status);
  const data = (await res.json()) as { otp_required?: boolean; access_token?: string | null; role?: Role; canal?: string | null; alerte_email?: string | null };
  return {
    otpRequired: Boolean(data.otp_required),
    session: data.access_token ? { token: data.access_token, role: data.role ?? "" } : null,
    canal: data.canal ?? null,
    alerteEmail: data.alerte_email ?? null,
  };
}

export async function loginVerify(email: string, password: string, code: string, faireConfiance: boolean): Promise<Session> {
  const res = await fetch(`${BASE}/api/v1/auth/login-verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Device-Id": deviceId() },
    body: JSON.stringify({ email, password, code, faire_confiance: faireConfiance }),
  });
  if (!res.ok) throw loginError(res.status);
  const data = (await res.json()) as { access_token?: string | null; role?: Role };
  if (!data.access_token) throw loginError(401);
  return { token: data.access_token, role: data.role ?? "" };
}

/** Pilotage access is scope-based (responsable de perimetre), not a single
 * permission: the server resolves the caller's perimeter. We consider the account
 * authorized when GET /pilotage/moi succeeds (200); a non-responsable gets 403. */
export async function aAccesPilotage(token: string): Promise<boolean> {
  const res = await fetch(`${BASE}/api/v1/pilotage/moi`, { headers: { Authorization: `Bearer ${token}` } });
  return res.ok;
}

export async function getStatistiques(token: string): Promise<Statistiques> {
  const res = await fetch(`${BASE}/api/v1/admin/statistiques`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const message =
      res.status === 401 ? "Session expirée" : res.status === 403 ? "Accès refusé" : "Statistiques indisponibles";
    throw new ApiError(message, res.status);
  }
  return (await res.json()) as Statistiques;
}

export function apiBaseUrl(): string {
  return BASE;
}

// --- Pilotage (perimeter-scoped) --------------------------------------------
// The same endpoints serve a global role (direction/admin: whole base) and a
// responsable de perimetre (bounded to their coordination/intendance). The
// backend resolves the scope; the front just renders what it gets.

async function authGet<T>(path: string, token: string, label: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) {
    const message =
      res.status === 401 ? "Session expirée" : res.status === 403 ? "Accès réservé aux responsables de périmètre" : `${label} indisponible`;
    throw new ApiError(message, res.status);
  }
  return (await res.json()) as T;
}

async function authSend<T>(path: string, token: string, method: string, body: unknown, label: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) {
    const message = res.status === 401 ? "Session expirée" : res.status === 403 ? "Action hors de votre périmètre" : `${label} impossible`;
    throw new ApiError(message, res.status);
  }
  return (await res.json()) as T;
}

export interface PilotageMoi {
  role: string;
  global: boolean;
  coordinations: number;
  intendances: number;
  tribus: number;
  membres_perimetre: number;
}

export interface TableauDeBord {
  membres_total: number;
  membres_actifs: number;
  membres_verifies: number;
  activites_a_venir: number;
}

export interface AgendaItem {
  id: string;
  titre: string;
  type: string | null;
  debut: string | null;
  fin: string | null;
  lieu: string | null;
  mode: string | null;
  cible_type: string | null;
}

export interface MembrePerimetre {
  id: string;
  matricule: string | null;
  nom_affichage: string | null;
  statut: string | null;
  verifie: boolean;
}

export interface ConsultationItem {
  id: string;
  titre: string;
  dimension: string;
  statut: string;
  evenement_id: string | null;
}

export interface ResultatQuestion {
  id: string;
  libelle: string;
  type: string;
  reponses: { valeur: string | null; n: number }[];
}

export interface ConsultationResultats {
  titre: string;
  repondants: number;
  questions: ResultatQuestion[];
}

export interface PerimetreUnite {
  id: string;
  nom: string;
  dimension: string;
}

export const getPilotageMoi = (t: string) => authGet<PilotageMoi>("/api/v1/pilotage/moi", t, "Profil pilotage");
export const getPerimetres = (t: string) => authGet<PerimetreUnite[]>("/api/v1/pilotage/perimetres", t, "Périmètres");
export const getTableauDeBord = (t: string) => authGet<TableauDeBord>("/api/v1/pilotage/tableau-de-bord", t, "Tableau de bord");
export const getPilotageAgenda = (t: string) => authGet<AgendaItem[]>("/api/v1/pilotage/agenda", t, "Agenda");
export const getPilotageMembres = (t: string) => authGet<MembrePerimetre[]>("/api/v1/pilotage/membres", t, "Membres");

export interface Assiduite {
  fenetre_jours: number;
  evenements: number;
  a_relancer: number;
  membres: { id: string; matricule: string | null; nom_affichage: string | null; presences: number }[];
}

export const getAssiduite = (t: string) => authGet<Assiduite>("/api/v1/pilotage/assiduite", t, "Assiduité");

export interface Tag {
  id: string;
  cle: string;
  libelle: string;
  famille: string;
  description: string | null;
}

export const getTags = (t: string) => authGet<Tag[]>("/api/v1/tags", t, "Tags");
export const demanderTag = (t: string, body: { famille: string; libelle: string; justification?: string }) =>
  authSend<{ id: string }>("/api/v1/pilotage/tags/demandes", t, "POST", body, "Demande de tag");

export const listConsultations = (t: string) => authGet<ConsultationItem[]>("/api/v1/pilotage/consultations", t, "Consultations");
export const getConsultationResultats = (t: string, id: string) =>
  authGet<ConsultationResultats>(`/api/v1/pilotage/consultations/${id}/resultats`, t, "Résultats");

export interface ConsultationCreate {
  titre: string;
  description?: string;
  dimension: string;
  scope_id?: string;
  questions: { libelle: string; type: string; options?: string[] }[];
}

export interface ActiviteCreate {
  titre: string;
  type?: string;
  debut: string;
  fin?: string;
  lieu?: string;
  mode?: string;
  cible_type: string;
  cible_id?: string;
  visibilite: string;
}

export const createActivite = (t: string, body: ActiviteCreate) =>
  authSend<{ id: string }>("/api/v1/pilotage/activites", t, "POST", body, "Création de l'activité");

export const createConsultation = (t: string, body: ConsultationCreate) =>
  authSend<{ id: string }>("/api/v1/pilotage/consultations", t, "POST", body, "Création de la consultation");

export const setConsultationStatut = (t: string, id: string, statut: string) =>
  authSend<{ id: string; statut: string }>(`/api/v1/pilotage/consultations/${id}/statut?statut=${statut}`, t, "POST", undefined, "Changement de statut");

/** Download the scope-bounded members CSV (auth header required, so fetch + blob). */
export async function exportMembresCsv(token: string): Promise<void> {
  const res = await fetch(`${BASE}/api/v1/pilotage/export/membres.csv`, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) {
    throw new ApiError(res.status === 403 ? "Export hors de votre périmètre" : "Export indisponible", res.status);
  }
  const blob = await res.blob();
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "membres-perimetre.csv";
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.URL.revokeObjectURL(url);
}

export interface ParticipationGlobal {
  nb_evenements: number;
  repartition_globale: { presents: number; partiels: number; absents: number; presentiel: number; en_ligne: number };
  serie_evenements: { id: string; titre: string; debut: string | null; volet: string; presents: number; partiels: number; absents: number }[];
}

export async function getParticipationGlobal(token: string): Promise<ParticipationGlobal> {
  const res = await fetch(`${BASE}/api/v1/admin/participation/global`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const message =
      res.status === 401 ? "Session expirée" : res.status === 403 ? "Accès refusé" : "Participation indisponible";
    throw new ApiError(message, res.status);
  }
  return (await res.json()) as ParticipationGlobal;
}

// --- Absences et excuses -----------------------------------------------------

export interface AbsenceLigne {
  evenement_id: string;
  membre_id: string;
  membre: string;
  matricule: string | null;
  activite: string | null;
  date: string | null;
  motif: string | null;
  motif_libelle: string;
  commentaire: string | null;
  qualification: "en_attente" | "excusee" | "non_excusee";
  decide_le: string | null;
  decideur: string | null;
  decision_commentaire: string | null;
  declare_le: string | null;
}

export interface AbsencesPage {
  absences: AbsenceLigne[];
  total: number;
  limite: number;
  decalage: number;
}

export interface SyntheseAbsences {
  en_attente: number;
  excusees: number;
  non_excusees: number;
  absences_totales: number;
  /** Absences carrying a reason, which are the only ones awaiting a decision. */
  avec_motif: number;
  taux_excusees: number;
  par_motif: { libelle: string; nombre: number }[];
}

export function getAbsences(
  token: string,
  opts: { qualification?: string; tri?: string; limite?: number; decalage?: number } = {},
): Promise<AbsencesPage> {
  const p = new URLSearchParams();
  if (opts.qualification) p.set("qualification", opts.qualification);
  if (opts.tri) p.set("tri", opts.tri);
  p.set("limite", String(opts.limite ?? 20));
  p.set("decalage", String(opts.decalage ?? 0));
  return authGet<AbsencesPage>(`/api/v1/pilotage/absences?${p.toString()}`, token, "Absences");
}

export const getSyntheseAbsences = (t: string) =>
  authGet<SyntheseAbsences>("/api/v1/pilotage/absences/synthese", t, "Synthèse des absences");

/** Excuse an absence, refuse it, or send it back for review. Always traced. */
export function qualifierAbsence(
  token: string,
  evenementId: string,
  membreId: string,
  decision: { qualification: string; commentaire?: string },
): Promise<{ qualification: string; avant: string }> {
  return authSend(
    `/api/v1/pilotage/absences/${evenementId}/${membreId}`,
    token,
    "PUT",
    decision,
    "Décision",
  );
}
