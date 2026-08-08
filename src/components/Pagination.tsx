// Server-side pagination, with the page size the reader chooses.
//
// Lists of people are long and get longer. Loading all of them and hiding most in the
// browser looks like pagination until the day the base has two thousand members, at
// which point every screen that does it becomes slow at once and nobody remembers
// why.
//
// So the size travels to the server, the count comes back with the rows, and the
// component says where the reader is: "1 à 10 sur 248". A reader who does not know
// how much is behind the page cannot tell a short list from a truncated one.

export const TAILLES = [5, 10, 15, 20, 25, 30, 50, 100] as const;

export interface EtatPagination {
  /** Zero-based offset, which is what the API expects. */
  decalage: number;
  limite: number;
  total: number;
}

export function Pagination({
  etat,
  onChange,
  libelle = "résultats",
  chargement = false,
}: {
  etat: EtatPagination;
  onChange: (suivant: { decalage: number; limite: number }) => void;
  libelle?: string;
  chargement?: boolean;
}): JSX.Element | null {
  const { decalage, limite, total } = etat;
  if (total === 0 && !chargement) return null;

  const pageCourante = Math.floor(decalage / limite) + 1;
  const pages = Math.max(1, Math.ceil(total / limite));
  const premier = total === 0 ? 0 : decalage + 1;
  const dernier = Math.min(decalage + limite, total);

  function aller(page: number): void {
    const cible = Math.min(Math.max(1, page), pages);
    onChange({ decalage: (cible - 1) * limite, limite });
  }

  return (
    <div className="pagination">
      <label className="pagination-taille">
        <span>Afficher</span>
        <select
          value={limite}
          onChange={(e) => {
            // Changing the size returns to the first page. Keeping the offset would
            // land the reader in the middle of a list they had not scrolled to.
            onChange({ decalage: 0, limite: Number(e.target.value) });
          }}
        >
          {TAILLES.map((n) => (
            <option key={n} value={n}>{n}</option>
          ))}
        </select>
        <span>par page</span>
      </label>

      <span className="pagination-position">
        {chargement ? "Chargement..." : `${premier} à ${dernier} sur ${total} ${libelle}`}
      </span>

      <div className="pagination-boutons">
        <button type="button" disabled={pageCourante <= 1} onClick={() => aller(1)} aria-label="Première page">
          «
        </button>
        <button type="button" disabled={pageCourante <= 1} onClick={() => aller(pageCourante - 1)}>
          Précédent
        </button>
        <span className="pagination-page">
          Page {pageCourante} sur {pages}
        </span>
        <button type="button" disabled={pageCourante >= pages} onClick={() => aller(pageCourante + 1)}>
          Suivant
        </button>
        <button type="button" disabled={pageCourante >= pages} onClick={() => aller(pages)} aria-label="Dernière page">
          »
        </button>
      </div>
    </div>
  );
}
