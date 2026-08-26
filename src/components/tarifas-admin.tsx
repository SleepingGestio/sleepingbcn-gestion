import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TiposLicenciaTuristicaAdmin } from "@/components/tipos-licencia-turistica-admin";
import { CanalesReservaAdmin } from "@/components/canales-reserva-admin";
import { TarifasLimpiezaAdmin } from "@/components/tarifas-limpieza-admin";
import { TarifasComisionOtaAdmin } from "@/components/tarifas-comision-ota-admin";
import { TarifasCobroCanalAdmin } from "@/components/tarifas-cobro-canal-admin";

export function TarifasAdmin({ readOnly = false }: { readOnly?: boolean }) {
  return (
    <Tabs defaultValue="limpieza" className="w-full">
      <TabsList>
        <TabsTrigger value="limpieza">Limpieza</TabsTrigger>
        <TabsTrigger value="comision">Comisión OTA</TabsTrigger>
        <TabsTrigger value="cobro">Cobro</TabsTrigger>
        <TabsTrigger value="licencias">Tipos de licencia</TabsTrigger>
        <TabsTrigger value="canales">Canales</TabsTrigger>
      </TabsList>
      <TabsContent value="limpieza">
        <TarifasLimpiezaAdmin readOnly={readOnly} />
      </TabsContent>
      <TabsContent value="comision">
        <TarifasComisionOtaAdmin readOnly={readOnly} />
      </TabsContent>
      <TabsContent value="cobro">
        <TarifasCobroCanalAdmin readOnly={readOnly} />
      </TabsContent>
      <TabsContent value="licencias">
        <TiposLicenciaTuristicaAdmin readOnly={readOnly} />
      </TabsContent>
      <TabsContent value="canales">
        <CanalesReservaAdmin readOnly={readOnly} />
      </TabsContent>
    </Tabs>
  );
}
