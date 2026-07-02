# dsov-Profil für digitale Abhängigkeits-Stücklisten

**Version:** 0.1.0 (Entwurf)
**Namespace:** `dsov:`
**Trägerformat:** [CycloneDX 1.6](https://cyclonedx.org/) (ECMA-424)
**Maintainer:** Pangea Intelligence, Wien - contact@pangea-intelligence.eu
**Lizenz:** Apache-2.0

## Zweck

Dieses Profil beschreibt die digitalen Abhängigkeiten eines Unternehmens als
maschinenlesbare Stückliste: Welche Software und welche Dienste hält den
Betrieb am Laufen, wem gehören sie, wo liegen die Daten, was passiert bei
einer Abschaltung, und wie schwer wäre der Ausstieg. Es übersetzt die Frage
nach digitaler Souveränität in dieselbe Logik, mit der ein Einkäufer
physische Lieferketten betrachtet: Klumpenrisiko sichtbar machen, bevor es
zum Problem wird.

Zielgruppe der Dateien sind IT-Leiter, Systemhäuser und Berater mittelständischer
Unternehmen. Jede Property ist so gewählt, dass sie sich in unter einer Minute
aus dem Kopf oder dem Vertragsordner beantworten lässt - ohne IT-Audit.

## Warum CycloneDX

CycloneDX ist ein etablierter, als ECMA-424 ratifizierter BOM-Standard, der
neben Software-Stücklisten ausdrücklich auch Dienste (SaaSBOM) abbildet.
Dieses Profil erfindet kein neues Format: Eine dsov-Stückliste ist eine
gewöhnliche CycloneDX-1.6-Datei, deren Einträge um Properties im
`dsov:`-Namespace ergänzt sind. Sie bleibt damit für jedes CycloneDX-Werkzeug
(z.B. Dependency-Track) lesbar, und wer sie pflegt, ist zugleich
CRA-anschlussfähig.

## Grundregeln

1. **Granularität ist die Vertrags- bzw. Anbieterebene.** "Microsoft 365" ist
   ein Eintrag, nicht Teams, Exchange und SharePoint einzeln. Der Ausfüller
   denkt in Verträgen, und das Klumpenrisiko hängt am Anbieter.
2. **Cloud-Dienste als `services`-Eintrag, installierte Software als
   `components`-Eintrag** (`type: "application"`). Die dsov-Properties sind
   für beide identisch.
3. **Alle 11 Properties sind Pflicht pro Eintrag.** Weil `unbekannt` bzw. die
   ehrliche schlechteste Stufe immer wählbar ist, gibt es keinen Grund, ein
   Feld wegzulassen. Nicht zu wissen, wo die eigenen Daten liegen, ist ein
   Befund und kein Ausfüllfehler - Prüfwerkzeuge behandeln `unbekannt`
   deshalb als eigenes Finding, nicht als Fehler.
4. **Abgeleitete Werte werden nicht erfragt.** Die Exit-Härte (Wechselkosten,
   Migrationszeit) berechnet sich aus Integrationstiefe, Alternativen und
   Datenportabilität. Niemand muss Euro-Beträge schätzen.
5. **Empfohlen, nicht Pflicht:** das eigene Unternehmen als
   `metadata.manufacturer.name` eintragen.

## Property-Referenz

Alle Schlüssel sind englisch (international anschlussfähig, registrierbar
beim CycloneDX Property-Taxonomy-Registry), alle Werte deutsch - denn die
Werte liest am Ende ein Mensch.

### Gruppe 1: Jurisdiktion

| Property | Werte | Bedeutung |
|---|---|---|
| `dsov:provider:country` | ISO-3166-1 alpha-2, z.B. `US`, `DE`, `CN` | Sitzland der **Konzernmutter** des Anbieters, nicht der Vertragsgesellschaft. Microsoft Ireland zählt als `US`. |
| `dsov:provider:extraterritorial` | `ja` / `nein` / `unbekannt` | Unterliegt der Anbieter extraterritorialen Zugriffs- oder Herausgabepflichten (z.B. US CLOUD Act, chinesisches Nachrichtendienstgesetz)? Faustregel: Konzernmutter in den USA oder China bedeutet `ja`. |
| `dsov:service:deployment` | `cloud-anbieter` / `cloud-eu-treuhand` / `on-premise-lizenzpflichtig` / `on-premise-autark` | Betriebsmodell. `on-premise-lizenzpflichtig` heißt: läuft im eigenen Haus, stellt aber ohne Lizenzserver oder Aktivierung des Anbieters den Dienst ein. Genau diese Stufe unterscheidet echtes On-Premise von gefühltem. |

### Gruppe 2: Daten

| Property | Werte | Bedeutung |
|---|---|---|
| `dsov:data:location` | `deutschland` / `eu-ewr` / `drittland` / `unbekannt` | Physischer Speicherort der Daten, die dieser Eintrag verarbeitet. |
| `dsov:data:classification` | `betriebsgeheimnisse` / `personenbezogen` / `geschäftsdaten` / `unkritisch` - **mehrfach erlaubt** | Was liegt dort. `betriebsgeheimnisse` sind Konstruktionsdaten, Rezepturen, Kalkulationen - alles, dessen Abfluss den Wettbewerb verschiebt. |
| `dsov:data:backup` | `unabhängig` / `beim-anbieter` / `keins` / `unbekannt` | Existiert eine Kopie **außerhalb der Kontrolle des Anbieters**? Ein Backup im selben Cloud-Konto zählt als `beim-anbieter`. |

### Gruppe 3: Abhängigkeit

| Property | Werte | Bedeutung |
|---|---|---|
| `dsov:dependency:criticality` | `geschäftskritisch` / `wichtig` / `ersetzbar` | Wie wichtig ist der Eintrag für den Betrieb. **Kein `unbekannt`** - diese Entscheidung muss das Unternehmen treffen, denn nur geschäftskritische Einträge können das Klumpenrisiko-Level deckeln. |
| `dsov:dependency:offlineCapability` | `dauerhaft` / `tage` / `stunden` / `sofort-tot` | Wie lange läuft der Prozess weiter, wenn der Anbieter ab sofort nicht mehr erreichbar ist. Bewusst getrennt von der Kritikalität: wie wichtig vs. wie schnell tot. |
| `dsov:dependency:integrationDepth` | `standalone` / `schnittstellen` / `tief-integriert` | Wie verwoben mit anderen Systemen. Ein ERP mit fünfzehn Schnittstellen ist `tief-integriert`, das alleinstehende Zeiterfassungs-Tool `standalone`. |

### Gruppe 4: Exit

| Property | Werte | Bedeutung |
|---|---|---|
| `dsov:exit:alternative` | `verfügbar` / `mit-abstrichen` / `keine` | Gibt es eine reale Alternative aus der EU oder für den Eigenbetrieb, die den Anwendungsfall trägt? |
| `dsov:exit:dataPortability` | `vollständig` / `teilweise` / `proprietär-gefangen` | Kommen die Daten in offenem, weiterverwendbarem Format wieder heraus? |

## Beispiel

Ein Maschinenbauer mit zwei typischen Einträgen: einem Cloud-Dienst und
einer installierten Anwendung. Die Pointe steckt im zweiten Eintrag - das
CAD-System läuft im eigenen Haus und ist trotzdem der härtere Klumpen, weil
es geschäftskritisch ist, ohne Lizenzserver sofort stirbt und die
Konstruktionsdaten proprietär gefangen sind.

```json
{
  "bomFormat": "CycloneDX",
  "specVersion": "1.6",
  "version": 1,
  "metadata": {
    "manufacturer": { "name": "Arnsberg Antriebstechnik GmbH (fiktiv)" }
  },
  "services": [
    {
      "name": "Microsoft 365",
      "provider": { "name": "Microsoft Ireland Operations Ltd." },
      "properties": [
        { "name": "dsov:provider:country", "value": "US" },
        { "name": "dsov:provider:extraterritorial", "value": "ja" },
        { "name": "dsov:service:deployment", "value": "cloud-anbieter" },
        { "name": "dsov:data:location", "value": "eu-ewr" },
        { "name": "dsov:data:classification", "value": "geschäftsdaten" },
        { "name": "dsov:data:classification", "value": "personenbezogen" },
        { "name": "dsov:data:backup", "value": "beim-anbieter" },
        { "name": "dsov:dependency:criticality", "value": "geschäftskritisch" },
        { "name": "dsov:dependency:offlineCapability", "value": "stunden" },
        { "name": "dsov:dependency:integrationDepth", "value": "tief-integriert" },
        { "name": "dsov:exit:alternative", "value": "mit-abstrichen" },
        { "name": "dsov:exit:dataPortability", "value": "teilweise" }
      ]
    }
  ],
  "components": [
    {
      "type": "application",
      "name": "SolidWorks",
      "supplier": { "name": "Dassault Systèmes SolidWorks Corp." },
      "properties": [
        { "name": "dsov:provider:country", "value": "FR" },
        { "name": "dsov:provider:extraterritorial", "value": "nein" },
        { "name": "dsov:service:deployment", "value": "on-premise-lizenzpflichtig" },
        { "name": "dsov:data:location", "value": "deutschland" },
        { "name": "dsov:data:classification", "value": "betriebsgeheimnisse" },
        { "name": "dsov:data:backup", "value": "unabhängig" },
        { "name": "dsov:dependency:criticality", "value": "geschäftskritisch" },
        { "name": "dsov:dependency:offlineCapability", "value": "sofort-tot" },
        { "name": "dsov:dependency:integrationDepth", "value": "schnittstellen" },
        { "name": "dsov:exit:alternative", "value": "mit-abstrichen" },
        { "name": "dsov:exit:dataPortability", "value": "proprietär-gefangen" }
      ]
    }
  ]
}
```

## Was Prüfwerkzeuge daraus machen

`sov-lint lint` prüft zwei Schichten: erstens die Gültigkeit als
CycloneDX-1.6-Datei (gegen das offizielle, unverändert gevendorte Schema),
zweitens das Profil - alle 11 Properties vorhanden, alle Werte gültig,
keine unbekannten oder doppelten `dsov:`-Properties.

Die Bewertung (Klumpenrisiko-Level 0 bis 4, Weakest-Link-Deckelung durch
geschäftskritische Einträge) ist bewusst **nicht** Teil dieser Spezifikation.
Die Datei beschreibt, das Werkzeug bewertet. So bleibt das Profil neutral
und für fremde Werkzeuge mit eigener Bewertungslogik nutzbar.

## Abgrenzung und Ausblick (v0.2)

Diese Version beschreibt ausschließlich die **eigenen** digitalen
Abhängigkeiten eines Unternehmens. Der Durchgriff auf Zulieferer (welche
digitalen Abhängigkeiten haben meine Tier-1-Lieferanten?) folgt in v0.2
zusammen mit einem Fragebogen, dessen maschinenlesbare Antworten direkt als
Einträge importierbar sind. Felder dafür werden erst spezifiziert, wenn der
Erfassungsweg existiert.
