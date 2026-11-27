# Urban Solar

Siga y controle su **batería virtual Urban Solar** desde Gladys: el saldo de
kWh disponible, la energía almacenada y retirada cada día, el ahorro
conseguido, escenas que reaccionan a la batería y dos widgets para el panel.

## Funcionamiento

Con la oferta de Urban Solar, la energía solar que no consume se inyecta a la
red y se abona, en kWh, en una batería virtual. Cuando su vivienda consume
después energía de la red, se descuenta primero de ese saldo; una vez vacío,
la energía se factura al precio pleno de la red. Cada kWh retirado sigue
pagando una tarifa de retirada (transporte, impuestos).

Urban Solar no ofrece una API pública, así que la integración reconstruye esa
cuenta a partir de los **índices acumulados** de su contador (consumo e
inyección), con una de estas dos fuentes, a elegir en la configuración:

- **Dispositivos Gladys** (por defecto): cualquier dispositivo ya presente en
  Gladys que mida la energía consumida e inyectada — el contador creado por
  el **seguimiento energético**, un Shelly o una pinza amperimétrica de otra
  integración… Una escena de Gladys lee sus índices y los pasa a la
  integración (ver más abajo).
- **Medidor Shelly**: un Shelly Pro 3EM, 3EM Gen3, Pro EM o EM Gen3 en la
  acometida, leído directamente por la integración por su red local.
  Potencias en directo, sin escena que crear.

En ambos casos, la integración calcula ella misma la diferencia entre dos
lecturas: una lectura perdida, un reinicio o un corte no pierden nada. Todo
queda en local: no se usa ningún servicio en la nube.

## Requisitos

- Gladys Assistant 5.2 o posterior.
- Fuente «Dispositivos Gladys»: uno o dos dispositivos con un **índice
  acumulado** (en kWh o Wh) de la energía consumida y de la inyectada. Una
  potencia (W) o un consumo diario no sirven.
- Fuente «Medidor Shelly»: un medidor de energía Shelly (Gen2 o posterior)
  en la acometida, accesible desde el equipo de Gladys, **sin autenticación**
  en su API local. Asígnele una IP fija en su router.

## Configuración

1. Abra la pestaña **Configuración** de la integración.
2. Elija la **fuente de datos**. Para el Shelly, indique también su dirección
   y su modelo.
3. Cree su **contrato de energía** en Gladys (ver más abajo): los precios se
   introducen allí, una sola vez, no en la integración.
4. Si lo desea, ajuste la **capacidad de referencia**, el **umbral de
   alerta** y el **intervalo de actualización**.
5. Guarde. Con la fuente «Dispositivos Gladys», cree la escena de lectura
   descrita más abajo.
6. Pulse **Probar las fuentes de datos**: la lectura del Shelly, o la última
   lectura enviada por la escena, aparece bajo el botón.
7. Pulse **Ajustar saldo** e introduzca el saldo que muestra su área de
   cliente Urban Solar.
8. Añada los dos dispositivos desde la pestaña **Descubrimiento**.

## La escena de lectura (fuente «Dispositivos Gladys»)

Una integración externa no puede leer por sí misma los dispositivos de otras
integraciones: una escena de Gladys le pasa sus valores.

1. Cree una escena que se active **cada 5 minutos** (disparador programado).
2. Añada la acción **«Obtener el último valor de un dispositivo»** sobre la
   función que da el **índice de consumo** (por ejemplo el contador del
   seguimiento energético).
3. Añada la misma acción sobre la función que da el **índice de inyección**
   (el mismo contador u otro dispositivo: Shelly, pinza…).
4. Añada la acción **«Urban Solar: registrar una lectura del contador»** y
   rellene sus campos con las variables que propone el editor de escenas para
   esos dos valores (por ejemplo `{{0.0.last_value}}` y
   `{{0.1.last_value}}`). Elija la **unidad**: kWh o Wh.
5. Opcional: indique también las **potencias consumida e inyectada** (W) para
   los valores en directo.

Enviar dos veces la misma lectura no cuenta nada; un índice que retrocede
(contador sustituido) simplemente vuelve a empezar. Sin lecturas durante 2
horas, la pantalla de configuración lo indica.

## Contrato de energía

Los precios no forman parte de la configuración de la integración: vienen de
su contrato de energía en Gladys. En el asistente de contratos de energía de Gladys, cree un contrato
a partir de la plantilla **Urban Solar — batería virtual**, vincúlelo a su
contador eléctrico e indique el **precio de la red**, la **tarifa de
retirada** y las suscripciones mensuales de electricidad y de batería
virtual.

La integración lee estos precios para calcular el ahorro, y Gladys le pide
valorar su consumo: cada media hora, la energía cubierta por la batería
virtual se factura a la tarifa de retirada y el resto al precio de la red.
Cuando cambie la tarifa, cierre el contrato y cree uno nuevo desde la fecha
del cambio. Sin contrato Urban Solar, la batería se sigue, pero no se calcula
ningún ahorro.

## Dispositivos

- **Urban Solar virtual battery**: saldo (kWh), nivel (%), potencias de carga
  y descarga (W), total almacenado y retirado (kWh), ahorro (€) y un
  interruptor **Contabilización** para pausar la cuenta.
- **Urban Solar grid connection**: potencias consumida e inyectada (W),
  energía consumida e inyectada desde el inicio (kWh) y energía comprada a
  tarifa plena.

## Escenas

Disparadores: **Cambio de estado de la batería virtual** (variables `state`,
`stock_kwh`), **Saldo bajo de la batería virtual** (`stock_kwh`,
`threshold_kwh`), **Balance diario de la batería virtual** (`date`,
`charged_kwh`, `discharged_kwh`, `grid_import_kwh`, `stock_kwh`,
`savings_eur`).

Acciones: **Urban Solar: registrar una lectura del contador** (ver la escena
de lectura), **Leer la batería virtual** (saldo, nivel, estado, ahorro, cifras
del día y potencias en directo para las acciones siguientes), **Actualizar la
batería virtual**, **Ajustar el saldo de la batería virtual**, **Pausar o
reanudar la contabilización**.

## Panel

- **Batería virtual**: indicador de nivel, saldo y potencias en directo,
  estado, fuente de datos, ahorro, historial del saldo, con los botones
  **Actualizar** y **Ajustar saldo**.
- **Balance energético**: energía almacenada, retirada y comprada a tarifa
  plena del día, totales, cobertura, ahorro y un botón para pausar o
  reanudar la contabilización.

## Solución de problemas

- _«La fuente de datos no responde»_: compruebe que el Shelly responde en
  `http://<dirección>/rpc/EMData.GetStatus?id=0` (trifásico) o
  `/rpc/EM1Data.GetStatus?id=0` (monofásico) y que el modelo es el correcto.
- _«Esperando la primera lectura»_ o _«No se ha recibido ninguna lectura
  desde hace…»_: compruebe que la escena de lectura está activa y se ejecuta,
  y que sus variables apuntan a los valores correctos.
- _No cambia nada y la escena usa «Actualizar la batería virtual»_: esa acción
  no lee nada con la fuente «Dispositivos Gladys». La escena debe llamar a
  **«Urban Solar: registrar una lectura del contador»** con los índices en sus
  campos. Cada lectura aparece en los registros de la integración
  (`Meter reading: …`), y una rechazada con su motivo
  (`Scene action record_meter_reading failed: …`).
- Las lecturas en la nube del Linky (API Conso) ya no se admiten desde la
  versión 3.
- Si el saldo se desvía del de Urban Solar, use de nuevo **Ajustar saldo**:
  las cifras de Urban Solar son las que valen.
- Inicie la integración con `LOG_LEVEL=debug` y revise sus registros.
