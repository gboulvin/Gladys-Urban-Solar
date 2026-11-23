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
cuenta a partir de las lecturas de su contador, con una o ambas fuentes:

- **Local — medidor Shelly**: un Shelly Pro 3EM, 3EM Gen3, Pro EM o EM Gen3
  en la acometida, leído por su red local en cada intervalo. Potencias en
  directo, sin nube, sin pérdidas durante un corte (el medidor guarda
  contadores acumulados).
- **Nube — lecturas Linky**: las lecturas diarias de su contador Linky,
  publicadas por Enedis al día siguiente, mediante la
  [API Conso](https://conso.boris.sh/) gratuita. Solo cifras diarias.

Con ambas, el interruptor **Preferir la conexión local** de la pantalla de
configuración elige la fuente preferida; la otra toma el relevo si falla, y
los dispositivos muestran entonces un punto naranja en su indicador de
transporte. Un día contabilizado por el Shelly, aunque sea en parte, nunca se
vuelve a contar desde las lecturas Linky.

## Requisitos

- Gladys Assistant 5.1 o posterior.
- Para la fuente local: un medidor de energía Shelly (Gen2 o posterior) en
  la acometida, accesible desde el equipo de Gladys, **sin autenticación** en
  su API local. Asígnele una IP fija en su router.
- Para la fuente en la nube: el número de 14 dígitos de su contador Linky
  (PRM, en su factura) y un token de Conso API, creado en
  <https://conso.boris.sh/> con su cuenta Enedis. La producción debe medirse
  en el mismo PRM.

## Configuración

1. Abra la pestaña **Configuración** de la integración.
2. Indique la **dirección del Shelly** (y su modelo), el **número y el token
   del contador Linky**, o ambos.
3. Revise los precios de su contrato: **precio de la red** y **tarifa de
   retirada**. Se usan para calcular el ahorro.
4. Si lo desea, ajuste la **capacidad de referencia** (el saldo mostrado como
   100 %), el **umbral de alerta** y el **intervalo de actualización**.
5. Guarde y pulse **Probar las fuentes de datos**: la respuesta de cada
   fuente aparece bajo el botón.
6. Pulse **Ajustar saldo** e introduzca el saldo que muestra su área de
   cliente Urban Solar.
7. Añada los dos dispositivos desde la pestaña **Descubrimiento**.

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

Acciones: **Leer la batería virtual** (saldo, nivel, estado, ahorro, cifras
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
- _Linky HTTP 401/403_: el token de Conso API no es válido o ha caducado.
- Las cifras de la nube aparecen al día siguiente.
- Si el saldo se desvía del de Urban Solar, use de nuevo **Ajustar saldo**:
  las cifras de Urban Solar son las que valen.
- Inicie la integración con `LOG_LEVEL=debug` y revise sus registros.
