import { CostingWizard } from "../components/costing-wizard";

export default function HomePage() {
  return (
    <main>
      <header className="hero">
        <p className="eyebrow">BETA · COSTEO ORGANIZACIONAL</p>
        <h1>Entendé cuánto gana realmente cada producto.</h1>
        <p className="lead">
          Primer corte funcional: fabricación simple, IVA, merma, mano de obra,
          indirectos y conciliación automática. La API procesa el cálculo sin persistir datos empresariales.
        </p>
      </header>
      <CostingWizard />
    </main>
  );
}
