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
compte à partir des **index cumulés** de votre compteur (soutirage et
injection), avec l'une des deux sources suivantes, au choix dans la
configuration :

- **Appareils Gladys** (par défaut) : n'importe quel appareil déjà présent
  dans Gladys qui mesure l'énergie soutirée et injectée — le compteur créé par
  le **suivi énergie**, un Shelly ou une pince ampèremétrique d'une autre
  intégration… Une scène Gladys lit leurs index et les transmet à
  l'intégration (voir ci-dessous).
- **Compteur Shelly** : un Shelly Pro 3EM, 3EM Gen3, Pro EM ou EM Gen3 posé
  sur l'arrivée du réseau, lu directement par l'intégration sur votre réseau
  local. Puissances en direct, sans scène à créer.

Dans les deux cas, l'intégration calcule elle-même la différence entre deux
relevés : un relevé manqué, un redémarrage ou une coupure ne font rien perdre,
le relevé suivant compte tout l'écart. Tout reste local : aucun service cloud
n'est utilisé.

## Prérequis

- Gladys Assistant 5.2 ou plus récent.
- Source « Appareils Gladys » : un ou deux appareils qui exposent un **index
  cumulé** (en kWh ou en Wh) de l'énergie soutirée et de l'énergie injectée.
  Une puissance (W) ou une consommation journalière ne conviennent pas.
- Source « Compteur Shelly » : un compteur d'énergie Shelly (Gen2 ou plus
  récent) sur l'arrivée du réseau, joignable depuis la machine Gladys, **sans
  authentification** sur son API locale. Donnez-lui une adresse IP fixe dans
  votre box.

## Configuration

1. Ouvrez l'onglet **Configuration** de l'intégration.
2. Choisissez la **source des données**. Pour le Shelly, renseignez aussi son
   adresse et son modèle.
3. Créez votre **contrat d'énergie** dans Gladys (voir plus bas) : les
   tarifs se saisissent là, une seule fois, pas dans l'intégration.
4. Réglez si besoin la **capacité de référence** (le stock affiché à 100 %),
   le seuil d'**alerte de stock bas** et l'**intervalle de rafraîchissement**.
5. Enregistrez. Avec la source « Appareils Gladys », créez la scène de relevé
   décrite ci-dessous.
6. Cliquez sur **Tester les sources de données** : la lecture du Shelly, ou
   le dernier relevé reçu de la scène, s'affiche sous le bouton.
7. Cliquez sur **Régler le stock** et saisissez le stock affiché dans votre
   espace client Urban Solar : l'intégration compte à partir de là.
8. Ajoutez les deux appareils depuis l'onglet **Découverte**.

## La scène de relevé (source « Appareils Gladys »)

Une intégration externe ne peut pas lire elle-même les appareils des autres
intégrations : c'est une scène Gladys qui lui transmet leurs valeurs.

1. Créez une scène déclenchée **toutes les 5 minutes** (déclencheur
   planifié). Plus court, les chiffres de la demi-heure sont plus fins ; plus
   long, rien n'est perdu pour autant.
2. Ajoutez l'action **« Récupérer la dernière valeur d'un appareil »** sur la
   fonctionnalité qui donne l'**index de soutirage** (par exemple le compteur
   du suivi énergie).
3. Ajoutez la même action sur la fonctionnalité qui donne l'**index
   d'injection** (le même compteur, ou un autre appareil : Shelly, pince…).
4. Ajoutez l'action **« Urban Solar : enregistrer un relevé du compteur »**
   et remplissez ses champs avec les variables que l'éditeur de scène propose
   pour ces deux valeurs (par exemple `{{0.0.last_value}}` et
   `{{0.1.last_value}}`, selon la place des actions dans la scène). Choisissez
   l'**unité** des index : kWh ou Wh.
5. Facultatif : renseignez aussi les **puissances soutirée et injectée** (W)
   pour les valeurs en direct.

Bon à savoir :

- Envoyer deux fois le même relevé ne compte rien. Un index qui recule
  (compteur remplacé) fait simplement repartir de ce relevé.
- Les index de soutirage et d'injection peuvent arriver dans des actions, ou
  même des scènes, séparées.
- Sans relevé pendant 2 heures, l'écran de configuration le signale et le
  badge des appareils passe à l'orange.

## Contrat d'énergie

Les tarifs ne font pas partie de la configuration de l'intégration : ils
viennent de votre contrat d'énergie dans Gladys. Dans l'assistant des contrats d'énergie de Gladys, créez un contrat à partir du modèle **Urban Solar — batterie
virtuelle**, rattachez-le à votre compteur électrique et renseignez :

- le **prix du kWh réseau** : le prix d'un kWh acheté au réseau une fois la
  batterie virtuelle vide ;
- les **frais de déstockage** : ce que coûte encore un kWh puisé dans la
  batterie virtuelle ;
- l'**abonnement électricité** et l'**abonnement batterie virtuelle**
  mensuels.

L'intégration lit ces tarifs pour calculer vos économies, et Gladys lui
demande de chiffrer votre consommation : chaque demi-heure, l'énergie couverte
par la batterie virtuelle est facturée aux frais de déstockage et le reste au
prix du réseau, si bien que le tableau de bord énergie de Gladys affiche ce
qu'Urban Solar facture réellement. Quand le tarif change, clôturez le contrat
et créez-en un nouveau à la date du changement : le passé garde ses anciens
prix. Sans contrat Urban Solar, la batterie est toujours suivie, mais aucune
économie n'est calculée.

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

- **Urban Solar : enregistrer un relevé du compteur** — transmet les index
  du compteur lus sur des appareils Gladys (voir la scène de relevé).
- **Lire la batterie virtuelle** — renvoie le stock, le niveau, l'état, les
  économies, les chiffres du jour et les puissances en direct, pour les
  actions suivantes (par exemple : ne lancer le chauffe-eau que si le stock
  dépasse 50 kWh).
- **Actualiser la batterie virtuelle** — lit le Shelly tout de suite (source
  « Compteur Shelly »).
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
- _« En attente du premier relevé »_ ou _« Aucun relevé reçu depuis… »_ :
  vérifiez que la scène de relevé est active et s'exécute, et que ses
  variables pointent sur les bonnes valeurs.
- _« Not a number »_ dans le journal de la scène : la variable ne renvoie pas
  un nombre ; vérifiez la fonctionnalité choisie.
- Les relevés cloud du Linky (API Conso) ne sont plus pris en charge depuis
  la version 3.
- Le stock s'écarte de celui d'Urban Solar : utilisez à nouveau **Régler le
  stock**. Les chiffres d'Urban Solar font foi.
- Lancez l'intégration avec `LOG_LEVEL=debug` et consultez ses logs.
