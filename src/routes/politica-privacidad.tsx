import { createFileRoute } from "@tanstack/react-router";

// Public, unauthenticated route. Reachable at
// https://sleepingbcn-gestion.appsbcn.workers.dev/politica-privacidad without
// login — Google's OAuth consent screen requires a publicly accessible
// Privacy Policy URL for the Google Contacts integration (automatic contact
// creation in importar_reservas_kb_supabase2.py).
//
// The auth bypass for this single path lives in
// src/components/auth-gate.tsx. Nothing else in the app is affected.
export const Route = createFileRoute("/politica-privacidad")({
  component: PoliticaPrivacidadPage,
});

function PoliticaPrivacidadPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <main className="mx-auto max-w-3xl px-6 py-12">
        <header className="mb-8 border-b pb-6">
          <div className="mb-4 inline-block rounded-md bg-slate-900 px-3 py-1 text-sm font-semibold tracking-tight text-white">
            SleepingBCN
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Política de Privacidad
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Última actualización: 2 de septiembre de 2026
          </p>
        </header>

        <div className="space-y-8 text-sm leading-relaxed">
          <section className="space-y-3">
            <h2 className="text-base font-semibold text-foreground">
              1. Responsable del tratamiento
            </h2>
            <p className="font-semibold">
              [PENDIENTE — Ramon: nombre legal completo del titular o razón
              social, NIF/CIF, y dirección postal]
            </p>
            <p className="text-muted-foreground">
              Correo de contacto: sleepingbcn@gmail.com
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-base font-semibold text-foreground">
              2. Qué datos tratamos
            </h2>
            <p className="text-muted-foreground">
              En el marco de la gestión de reservas de nuestros apartamentos
              turísticos, tratamos los siguientes datos de nuestros huéspedes,
              recibidos a través de nuestro Channel Manager (Krossbooking) y de
              las plataformas de reserva (OTAs) con las que trabajamos:
            </p>
            <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
              <li>Nombre y apellidos</li>
              <li>Teléfono</li>
              <li>Correo electrónico (cuando se facilita)</li>
              <li>Fechas de estancia y apartamento reservado</li>
              <li>Plataforma de origen de la reserva (Booking, Airbnb, etc.)</li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-base font-semibold text-foreground">
              3. Para qué usamos estos datos
            </h2>
            <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
              <li>
                Gestionar la reserva: confirmación, check-in/check-out,
                comunicación durante la estancia.
              </li>
              <li>
                Coordinación interna de limpiezas y mantenimiento asociadas a
                cada reserva.
              </li>
              <li>
                Guardar el contacto del huésped en nuestra agenda de Google
                Contacts, para poder comunicarnos con él por teléfono o WhatsApp
                antes y durante su estancia. Solo se crea un contacto nuevo si su
                teléfono no está ya guardado; nunca se sobrescribe un contacto
                existente.
              </li>
              <li>
                Cumplimiento de obligaciones legales (p. ej., registro de
                viajeros cuando sea aplicable).
              </li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-base font-semibold text-foreground">
              4. Con quién compartimos estos datos
            </h2>
            <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
              <li>
                <strong className="font-semibold text-foreground">
                  Google (Google Contacts)
                </strong>
                : nombre y teléfono, para el punto anterior.
              </li>
              <li>
                <strong className="font-semibold text-foreground">
                  Supabase
                </strong>
                : proveedor de base de datos donde almacenamos la información de
                las reservas.
              </li>
              <li>
                No cedemos ni vendemos datos a terceros con fines comerciales o
                publicitarios.
              </li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-base font-semibold text-foreground">
              5. Base legal
            </h2>
            <p className="text-muted-foreground">
              El tratamiento se basa en la ejecución del contrato de alojamiento
              (la reserva) y, en su caso, en el cumplimiento de obligaciones
              legales aplicables al sector del alojamiento turístico.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-base font-semibold text-foreground">
              6. Conservación
            </h2>
            <p className="text-muted-foreground">
              Conservamos los datos de la reserva durante el tiempo necesario
              para la gestión de la estancia y el cumplimiento de las
              obligaciones legales y fiscales aplicables.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-base font-semibold text-foreground">
              7. Tus derechos
            </h2>
            <p className="text-muted-foreground">
              Puedes ejercer tus derechos de acceso, rectificación, supresión,
              oposición y portabilidad escribiendo a sleepingbcn@gmail.com.
              También puedes presentar una reclamación ante la Agencia Española
              de Protección de Datos (
              <a
                href="https://www.aepd.es"
                target="_blank"
                rel="noreferrer"
                className="underline underline-offset-2 hover:text-foreground"
              >
                www.aepd.es
              </a>
              ) si consideras que no hemos tratado tus datos correctamente.
            </p>
          </section>
        </div>
      </main>
    </div>
  );
}
