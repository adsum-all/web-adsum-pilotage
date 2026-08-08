// Deciding whether an absence is excused.
//
// The screen the rule was waiting for. A member may say why they were not there;
// somebody else decides what that is worth, and until this page existed there was
// nowhere for that somebody to do it. The rule "a member never excuses themselves"
// held only because nobody could excuse anything at all.
//
// The queue opens on what is waiting, because that is the only part that needs a
// person. Decisions already taken stay reachable, and reopening one is itself a
// decision that leaves its own trace.

import { useCallback, useState } from "react";

import {
  type AbsenceLigne,
  getAbsences,
  getSyntheseAbsences,
  qualifierAbsence,
} from "../api.js";
import { useResource } from "../useResource.js";
import { Pagination } from "./Pagination.js";

const FILTRES: { cle: string; label: string; aide: string }[] = [
  { cle: "en_attente", label: "En attente", aide: "Absences motivées sur lesquelles personne ne s'est encore prononcé." },
  { cle: "excusee", label: "Excusées", aide: "Absences qu'un responsable a explicitement excusées." },
  { cle: "non_excusee", label: "Non excusées", aide: "Absences examinées et refusées." },
  { cle: "", label: "Toutes", aide: "Toutes les absences motivées de votre périmètre." },
];

const TONS: Record<string, string> = {
  en_attente: "warn",
  excusee: "ok",
  non_excusee: "danger",
};

const LIBELLES: Record<string, string> = {
  en_attente: "En attente de décision",
  excusee: "Absence excusée",
  non_excusee: "Absence non excusée",
};

function dateCourte(iso: string | null): string {
  if (!iso) return "-";
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? "-"
    : new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium" }).format(d);
}

export function Absences({ token }: { token: string }): JSX.Element {
  const [filtre, setFiltre] = useState("en_attente");
  const [decalage, setDecalage] = useState(0);
  const [limite, setLimite] = useState(10);
  const [enCours, setEnCours] = useState<string | null>(null);
  const [message, setMessage] = useState<{ texte: string; ton: "ok" | "erreur" } | null>(null);
  const [commentaires, setCommentaires] = useState<Record<string, string>>({});
  const [rafraichir, setRafraichir] = useState(0);

  const liste = useResource(
    () => getAbsences(token, { qualification: filtre || undefined, limite, decalage }),
    [token, filtre, limite, decalage, rafraichir],
  );
  const synthese = useResource(() => getSyntheseAbsences(token), [token, rafraichir]);

  const decider = useCallback(
    async (a: AbsenceLigne, qualification: string) => {
      const cle = `${a.evenement_id}:${a.membre_id}`;
      setEnCours(cle);
      setMessage(null);
      try {
        await qualifierAbsence(token, a.evenement_id, a.membre_id, {
          qualification,
          commentaire: commentaires[cle]?.trim() || undefined,
        });
        setMessage({
          texte: `${a.membre} : ${LIBELLES[qualification] ?? qualification}.`,
          ton: "ok",
        });
        setCommentaires((c) => ({ ...c, [cle]: "" }));
        // The counters move with the decision, so the queue does not lie about how
        // much is left the moment somebody clears an item.
        setRafraichir((n) => n + 1);
      } catch (e) {
        setMessage({ texte: e instanceof Error ? e.message : "Décision impossible.", ton: "erreur" });
      } finally {
        setEnCours(null);
      }
    },
    [token, commentaires],
  );

  const s = synthese.data;

  return (
    <section>
      <header className="page-head">
        <h2>Absences et excuses</h2>
        <p className="muted">
          Un membre indique pourquoi il n'a pas suivi une activité. Vous seul décidez si
          l'absence est excusée. Le membre ne peut jamais qualifier la sienne.
        </p>
      </header>

      {s && (
        <div className="kpi-rangee">
          <Compteur
            label="En attente de vous"
            valeur={s.en_attente}
            aide="Absences motivées sur lesquelles aucune décision n'a été prise."
            accent
          />
          <Compteur label="Excusées" valeur={s.excusees} aide="Décision explicite d'un responsable habilité." />
          <Compteur label="Non excusées" valeur={s.non_excusees} aide="Examinées puis refusées." />
          <Compteur
            label="Taux d'absences excusées"
            valeur={`${s.taux_excusees} %`}
            aide={`Calculé sur les ${s.avec_motif} absences motivées, pas sur les ${s.absences_totales} absences totales : une absence sans motif ne demande aucune décision.`}
          />
        </div>
      )}

      <div className="barre-filtres">
        {FILTRES.map((f) => (
          <button
            key={f.cle || "toutes"}
            type="button"
            title={f.aide}
            className={`puce${filtre === f.cle ? " est-active" : ""}`}
            onClick={() => { setFiltre(f.cle); setDecalage(0); }}
          >
            {f.label}
          </button>
        ))}
      </div>

      {message && (
        <p className={`banner banner-${message.ton === "ok" ? "ok" : "error"}`}>{message.texte}</p>
      )}

      {liste.loading && <p className="muted">Chargement des absences...</p>}
      {liste.error && !liste.loading && <p className="banner banner-error">{liste.error}</p>}

      {liste.data && !liste.loading && (
        liste.data.absences.length === 0 ? (
          <p className="vide">
            {filtre === "en_attente"
              ? "Aucune absence n'attend votre décision."
              : "Aucune absence sur ce filtre."}
          </p>
        ) : (
          <>
            <ul className="absences">
              {liste.data.absences.map((a) => {
                const cle = `${a.evenement_id}:${a.membre_id}`;
                const traite = enCours === cle;
                return (
                  <li key={cle} className="absence">
                    <div className="absence-tete">
                      <div>
                        <strong>{a.membre}</strong>
                        <span className="muted small"> . {a.matricule}</span>
                        <p className="muted small">
                          {a.activite} . {dateCourte(a.date)}
                        </p>
                      </div>
                      <span className={`etiquette etiquette-${TONS[a.qualification] ?? "neutre"}`}>
                        {LIBELLES[a.qualification] ?? a.qualification}
                      </span>
                    </div>

                    <p className="absence-motif">
                      <strong>Motif déclaré :</strong> {a.motif_libelle}
                      {a.commentaire && <> . « {a.commentaire} »</>}
                    </p>

                    {a.decideur && (
                      <p className="muted small">
                        Décidé par {a.decideur} le {dateCourte(a.decide_le)}
                        {a.decision_commentaire && <> . « {a.decision_commentaire} »</>}
                      </p>
                    )}

                    <div className="absence-actions">
                      <input
                        type="text"
                        placeholder="Note de décision (facultative)"
                        value={commentaires[cle] ?? ""}
                        onChange={(e) => setCommentaires((c) => ({ ...c, [cle]: e.target.value }))}
                      />
                      {a.qualification !== "excusee" && (
                        <button type="button" className="btn btn-ok" disabled={traite} onClick={() => void decider(a, "excusee")}>
                          Excuser
                        </button>
                      )}
                      {a.qualification !== "non_excusee" && (
                        <button type="button" className="btn btn-danger" disabled={traite} onClick={() => void decider(a, "non_excusee")}>
                          Ne pas excuser
                        </button>
                      )}
                      {a.qualification !== "en_attente" && (
                        // Reopening is a decision too, and it clears the previous
                        // decider so the file stops looking settled.
                        <button type="button" className="btn btn-ghost" disabled={traite} onClick={() => void decider(a, "en_attente")}>
                          Remettre en attente
                        </button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>

            <Pagination
              etat={{ decalage, limite, total: liste.data.total }}
              libelle="absence(s)"
              chargement={liste.loading}
              onChange={({ decalage: d, limite: l }) => { setDecalage(d); setLimite(l); }}
            />
          </>
        )
      )}

      {s && s.par_motif.length > 0 && (
        <div className="carte" style={{ marginTop: 18 }}>
          <h3>Répartition des motifs</h3>
          <p className="muted small">
            Sur l'ensemble des absences motivées de votre périmètre. Le nombre est donné
            à côté de chaque motif : un pourcentage seul ne dit pas s'il porte sur trois
            personnes ou sur trois cents.
          </p>
          <ul className="motifs">
            {s.par_motif.map((m) => (
              <li key={m.libelle}>
                <span>{m.libelle}</span>
                <span className="motifs-barre" aria-hidden="true">
                  <span
                    style={{
                      width: `${s.absences_totales ? (100 * m.nombre) / s.absences_totales : 0}%`,
                    }}
                  />
                </span>
                <strong>{m.nombre}</strong>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

function Compteur({
  label, valeur, aide, accent = false,
}: { label: string; valeur: number | string; aide: string; accent?: boolean }): JSX.Element {
  return (
    <div className={`kpi${accent ? " kpi-accent" : ""}`} title={aide}>
      <span className="kpi-label">{label}</span>
      <strong className="kpi-valeur">{valeur}</strong>
      <span className="kpi-aide">{aide}</span>
    </div>
  );
}
