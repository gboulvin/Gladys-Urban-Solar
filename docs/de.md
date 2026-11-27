# Urban Solar

Überwachen und steuern Sie Ihre **virtuelle Batterie von Urban Solar** in
Gladys: den verfügbaren kWh-Bestand, die täglich gespeicherte und entnommene
Energie, die erzielte Ersparnis, Szenen, die auf die Batterie reagieren, und
zwei Dashboard-Widgets.

## Funktionsweise

Beim Angebot von Urban Solar wird der nicht selbst verbrauchte Solarstrom ins
Netz eingespeist und in kWh einer virtuellen Batterie gutgeschrieben. Bezieht
Ihr Haushalt später Strom aus dem Netz, wird er zuerst diesem Bestand
entnommen; ist der Bestand leer, wird der Strom zum vollen Netzpreis
abgerechnet. Jede entnommene kWh kostet weiterhin eine Entnahmegebühr
(Netzentgelt, Steuern).

Urban Solar bietet keine öffentliche API: Die Integration rekonstruiert das
Konto daher aus den **kumulierten Zählerständen** (Bezug und Einspeisung), mit
einer der beiden Quellen, die Sie in der Konfiguration wählen:

- **Gladys-Geräte** (Standard): jedes Gerät, das bereits in Gladys ist und
  die bezogene und eingespeiste Energie misst — der Zähler der
  **Energieüberwachung**, ein Shelly oder eine Stromzange einer anderen
  Integration… Eine Gladys-Szene liest ihre Zählerstände und übergibt sie der
  Integration (siehe unten).
- **Shelly-Zähler**: ein Shelly Pro 3EM, 3EM Gen3, Pro EM oder EM Gen3 am
  Netzanschluss, direkt von der Integration über Ihr lokales Netz gelesen.
  Live-Leistungen, keine Szene nötig.

In beiden Fällen berechnet die Integration die Differenz zwischen zwei
Messwerten selbst: Ein fehlender Messwert, ein Neustart oder ein Ausfall
verlieren nichts. Alles bleibt lokal: Es wird kein Cloud-Dienst genutzt.

## Voraussetzungen

- Gladys Assistant 5.2 oder neuer.
- Quelle „Gladys-Geräte“: ein oder zwei Geräte mit einem **kumulierten
  Zählerstand** (in kWh oder Wh) für Bezug und Einspeisung. Eine Leistung (W)
  oder ein Tagesverbrauch eignen sich nicht.
- Quelle „Shelly-Zähler“: ein Shelly-Energiezähler (Gen2 oder neuer) am
  Netzanschluss, vom Gladys-Host erreichbar, **ohne Authentifizierung** an
  seiner lokalen API. Vergeben Sie ihm eine feste IP-Adresse im Router.

## Konfiguration

1. Öffnen Sie den Reiter **Konfiguration** der Integration.
2. Wählen Sie die **Datenquelle**. Für den Shelly geben Sie auch Adresse und
   Modell ein.
3. Legen Sie Ihren **Energievertrag** in Gladys an (siehe unten): Die Preise
   werden dort einmal eingegeben, nicht in der Integration.
4. Legen Sie bei Bedarf die **Referenzkapazität**, die **Warnschwelle** und
   das **Aktualisierungsintervall** fest.
5. Speichern Sie. Mit der Quelle „Gladys-Geräte“ legen Sie die unten
   beschriebene Messwert-Szene an.
6. Klicken Sie auf **Datenquellen testen**: Der Shelly-Messwert oder der
   letzte Messwert der Szene erscheint unter der Schaltfläche.
7. Klicken Sie auf **Bestand setzen** und geben Sie den in Ihrem
   Urban-Solar-Kundenbereich angezeigten Bestand ein.
8. Fügen Sie die beiden Geräte im Reiter **Erkennung** hinzu.

## Die Messwert-Szene (Quelle „Gladys-Geräte“)

Eine externe Integration kann die Geräte anderer Integrationen nicht selbst
lesen: Eine Gladys-Szene übergibt ihr deren Werte.

1. Legen Sie eine Szene an, die **alle 5 Minuten** ausgelöst wird (geplanter
   Auslöser).
2. Fügen Sie die Aktion **„Letzten Wert eines Geräts abrufen“** für die
   Funktion mit dem **Bezugsstand** hinzu (z. B. der Zähler der
   Energieüberwachung).
3. Fügen Sie dieselbe Aktion für die Funktion mit dem **Einspeisestand**
   hinzu (derselbe Zähler oder ein anderes Gerät: Shelly, Stromzange…).
4. Fügen Sie die Aktion **„Urban Solar: Zählerstand erfassen“** hinzu und
   füllen Sie ihre Felder mit den Variablen, die der Szeneneditor für diese
   beiden Werte anbietet (z. B. `{{0.0.last_value}}` und
   `{{0.1.last_value}}`). Wählen Sie die **Einheit**: kWh oder Wh.
5. Optional: Geben Sie auch **Bezugs- und Einspeiseleistung** (W) für die
   Live-Werte an.

Derselbe Messwert zweimal gesendet zählt nichts; ein rückläufiger
Zählerstand (ersetzter Zähler) beginnt einfach neu. Ohne Messwert über 2
Stunden meldet es der Konfigurationsbildschirm.

## Energievertrag

Die Preise gehören nicht zur Konfiguration der Integration: Sie stammen aus
Ihrem Energievertrag in Gladys. Legen Sie im Energievertrags-Assistenten von Gladys
einen Vertrag aus der Vorlage **Urban Solar — virtuelle Batterie** an,
verknüpfen Sie ihn mit Ihrem Stromzähler und geben Sie den **Netzpreis**, die
**Entnahmegebühr** sowie die monatlichen Grundgebühren für Strom und die
virtuelle Batterie ein.

Die Integration liest diese Preise zur Berechnung Ihrer Ersparnis, und Gladys
lässt sie Ihren Verbrauch bepreisen: Jede halbe Stunde wird die von der
virtuellen Batterie gedeckte Energie zur Entnahmegebühr und der Rest zum
Netzpreis berechnet. Ändert sich der Tarif, schließen Sie den Vertrag und
legen ab dem Änderungsdatum einen neuen an. Ohne Urban-Solar-Vertrag wird die
Batterie weiter erfasst, aber keine Ersparnis berechnet.

## Geräte

- **Urban Solar virtual battery**: Bestand (kWh), Füllstand (%), Lade- und
  Entladeleistung (W), insgesamt gespeichert und entnommen (kWh), Ersparnis
  (€) und ein Schalter **Abrechnung**, um die Erfassung zu pausieren.
- **Urban Solar grid connection**: Bezugs- und Einspeiseleistung (W),
  bezogene und eingespeiste Energie seit Beginn (kWh) und zum Volltarif
  gekaufte Energie.

## Szenen

Auslöser: **Zustand der virtuellen Batterie geändert** (Variablen `state`,
`stock_kwh`), **Niedriger Bestand der virtuellen Batterie** (`stock_kwh`,
`threshold_kwh`), **Tagesbilanz der virtuellen Batterie** (`date`,
`charged_kwh`, `discharged_kwh`, `grid_import_kwh`, `stock_kwh`,
`savings_eur`).

Aktionen: **Urban Solar: Zählerstand erfassen** (siehe Messwert-Szene),
**Virtuelle Batterie auslesen** (Bestand, Füllstand, Zustand,
Ersparnis, Tageswerte, Live-Leistungen für die folgenden Aktionen),
**Virtuelle Batterie aktualisieren**, **Bestand der virtuellen Batterie
setzen**, **Abrechnung pausieren oder fortsetzen**.

## Dashboard

- **Virtuelle Batterie**: Füllstandsanzeige, Live-Bestand und -Leistungen,
  Zustand, Datenquelle, Ersparnis, Bestandsverlauf, mit den Schaltflächen
  **Aktualisieren** und **Bestand setzen**.
- **Energiebilanz**: gespeicherte, entnommene und voll bezahlte Energie des
  Tages, Summen, Deckungsanteil, Ersparnis und eine Schaltfläche zum
  Pausieren oder Fortsetzen der Abrechnung.

## Fehlerbehebung

- _„Die Datenquelle antwortet nicht“_: Prüfen Sie, ob der Shelly unter
  `http://<Adresse>/rpc/EMData.GetStatus?id=0` (dreiphasig) bzw.
  `/rpc/EM1Data.GetStatus?id=0` (einphasig) antwortet und das richtige
  Modell gewählt ist.
- _„Warte auf den ersten Zählerstand“_ oder _„Seit … Minuten kein
  Zählerstand“_: Prüfen Sie, ob die Messwert-Szene aktiv ist und läuft und
  ihre Variablen auf die richtigen Werte zeigen.
- _Nichts bewegt sich, und die Szene nutzt „Virtuelle Batterie aktualisieren“_:
  Diese Aktion liest mit der Quelle „Gladys-Geräte“ nichts. Die Szene muss
  **„Urban Solar: Zählerstand erfassen“** mit den Zählerständen aufrufen. Jeder
  Messwert steht in den Logs der Integration (`Meter reading: …`), ein
  abgelehnter mit seinem Grund (`Scene action record_meter_reading failed: …`).
- Die Linky-Clouddaten (Conso-API) werden seit Version 3 nicht mehr
  unterstützt.
- Weicht der Bestand von Urban Solar ab, nutzen Sie erneut **Bestand
  setzen**: Die Werte von Urban Solar sind maßgeblich.
- Starten Sie die Integration mit `LOG_LEVEL=debug` und prüfen Sie die Logs.
