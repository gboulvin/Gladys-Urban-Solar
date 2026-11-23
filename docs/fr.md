# Urban Solar

Suivez et pilotez votre **batterie virtuelle Urban Solar** depuis Gladys :
le stock de kWh disponible, l'énergie stockée et déstockée chaque jour, les
économies réalisées, des scènes qui réagissent à la batterie et deux widgets
de tableau de bord.

## Fonctionnement

Avec l'offre Urban Solar, l'énergie solaire que vous ne consommez pas est
injectée sur le réseau et créditée, en kWh, dans une batterie virtuelle.
Quand votre logement soutire ensuite de l'énergie au réseau, elle est
d'abord puisée dans ce stock ; une fois le stock vide, l'énergie est facturée
au prix plein du réseau. Chaque kWh déstocké paie encore des frais de
déstockage (acheminement, taxes).

Urban Solar ne propose pas d'API publique : l'intégration reconstitue donc ce
compte à partir des relevés de votre compteur, avec l'une ou les deux sources
suivantes :

- **Locale — compteur Shelly** : un Shelly Pro 3EM, 3EM Gen3, Pro EM ou EM
  Gen3 posé sur l'arrivée du réseau, lu sur votre réseau local à chaque
  intervalle de rafraîchissement. Puissances en direct, sans cloud, rien
  n'est perdu pendant une coupure (le compteur garde des index cumulés).
- **Cloud — relevés Linky** : les relevés quotidiens de votre compteur Linky,
  publiés par Enedis le lendemain, via l'[API Conso](https://conso.boris.sh/)
  gratuite. Chiffres quotidiens uniquement, pas de puissance en direct.

Avec les deux, l'interrupteur **Préférer la connexion locale** de l'écran de
configuration choisit la source préférée ; l'autre prend le relais en cas
d'échec, et les appareils affichent alors un point orange sur leur badge de
transport. Une journée comptabilisée par le Shelly, même partiellement, n'est
jamais recomptée à partir des relevés Linky.

## Prérequis

- Gladys Assistant 5.1 ou plus récent.
- Pour la source locale : un compteur d'énergie Shelly (Gen2 ou plus récent)
  sur l'arrivée du réseau, joignable depuis la machine Gladys, **sans
  authentification** sur son API locale. Donnez-lui une adresse IP fixe dans
  votre box.
- Pour la source cloud : le numéro à 14 chiffres de votre compteur Linky (PRM,
  sur votre facture) et un jeton Conso API, créé sur
  <https://conso.boris.sh/> avec votre compte Enedis. Votre production doit
  être mesurée sur le même PRM (le cas habituel de l'autoconsommation avec
  vente du surplus).

## Configuration

1. Ouvrez l'onglet **Configuration** de l'intégration.
2. Renseignez l'**adresse du Shelly** (et son modèle), le **numéro et le
   jeton du compteur Linky**, ou les deux.
3. Vérifiez les tarifs de votre contrat : **prix du kWh réseau** (prix d'un
   kWh acheté au réseau) et **frais de déstockage** (ce que coûte encore un
   kWh puisé dans la batterie virtuelle). Ils servent au calcul de vos
   économies.
4. Réglez si besoin la **capacité de référence** (le stock affiché à 100 %),
   le seuil d'**alerte de stock bas** et l'**intervalle de rafraîchissement**.
5. Enregistrez, puis cliquez sur **Tester les sources de données** : la
   réponse de chaque source s'affiche sous le bouton.
6. Cliquez sur **Régler le stock** et saisissez le stock affiché dans votre
   espace client Urban Solar : l'intégration compte à partir de là.
7. Ajoutez les deux appareils depuis l'onglet **Découverte**.

## Appareils

- **Urban Solar virtual battery** : stock (kWh), niveau (%), puissances de
  charge et de décharge (W), totaux stocké et déstocké (kWh), économies (€),
  et un interrupteur **Comptabilisation** pour suspendre le comptage
  (changement de compteur, travaux).
- **Urban Solar grid connection** : puissances soutirée et injectée (W),
  énergie soutirée et injectée depuis le début (kWh), et énergie achetée au
  prix plein faute de stock.

## Scènes

Déclencheurs :

- **État de la batterie virtuelle changé** — en charge, en décharge, vide ou
  au repos (filtre sur le nouvel état). Variables : `state`, `stock_kwh`.
- **Stock de batterie virtuelle bas** — le stock est passé sous le seuil
  d'alerte. Variables : `stock_kwh`, `threshold_kwh`.
- **Bilan quotidien de la batterie virtuelle** — une journée est close.
  Variables : `date`, `charged_kwh`, `discharged_kwh`, `grid_import_kwh`,
  `stock_kwh`, `savings_eur`.

Actions :

- **Lire la batterie virtuelle** — renvoie le stock, le niveau, l'état, les
  économies, les chiffres du jour et les puissances en direct, pour les
  actions suivantes (par exemple : ne lancer le chauffe-eau que si le stock
  dépasse 50 kWh).
- **Actualiser la batterie virtuelle** — lit le compteur tout de suite.
- **Régler le stock de la batterie virtuelle** — aligne le stock sur Urban
  Solar.
- **Suspendre ou reprendre le comptage**.

## Tableau de bord

- **Batterie virtuelle** : jauge de niveau, stock et puissances en direct,
  état, source des données, économies, historique du stock (période choisie
  dans les réglages du widget), avec un bouton **Actualiser** et un bouton
  **Régler le stock**.
- **Bilan énergétique** : énergie stockée, déstockée et achetée plein tarif
  sur la journée, totaux, part du soutirage couverte par la batterie,
  économies, et un bouton pour suspendre ou reprendre le comptage.

## Dépannage

- _« La source de données ne répond pas »_ : vérifiez que le Shelly répond à
  `http://<adresse>/rpc/EMData.GetStatus?id=0` (triphasé) ou
  `/rpc/EM1Data.GetStatus?id=0` (monophasé) depuis votre réseau, et que le
  bon modèle est choisi.
- _Linky HTTP 401/403_ : le jeton Conso API est invalide ou expiré, ou le PRM
  ne lui correspond pas.
- Les chiffres cloud apparaissent le lendemain, une fois publiés par Enedis.
- Le stock s'écarte de celui d'Urban Solar : utilisez à nouveau **Régler le
  stock**. Les chiffres d'Urban Solar font foi.
- Lancez l'intégration avec `LOG_LEVEL=debug` et consultez ses logs.
