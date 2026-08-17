import { CostingWizard } from "../components/costing-wizard";

export default function HomePage() {
  return (
    <main>
      <header className="hero">
        <div className="hero-copy">
          <p className="eyebrow">GRATIS · COSTEO ORGANIZACIONAL</p>
          <h1>Costeá según cómo funciona tu negocio.</h1>
          <p className="lead">
            Configurá fabricación, reventa o actividad mixta. El asistente adapta la carga,
            valida los datos y explica qué resultados están disponibles.
          </p>
        </div>
        <aside className="hero-note">
          <strong>Importes sin IVA</strong>
          Costos, gastos y precios se cargan netos. La API procesa el cálculo sin persistir la sesión; el motor local queda como respaldo y la continuidad, en tu archivo.
        </aside>
      </header>
      <CostingWizard />
    </main>
  );
}
