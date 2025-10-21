Επαλήθευση Βάσης Δεδομένων

Η βάση σου έχει όλα τα σωστά tables — και μπορούμε να δουλέψουμε πάνω σε αυτά, χωρίς να τα αλλάξουμε.
Ιδανικά για όσα ζητάς είναι:

athletes

age_categories

weight_categories

category_changes

points_history

results

tournaments

tournament_registrations

placement_points

win_points

🧮 Κανόνες που θα υλοποιήσουμε
1️⃣ Αλλαγή ηλικιακής κατηγορίας

Αυτόματη με βάση την ημερομηνία γέννησης (birth_date).

Όταν αλλάζει, εγγραφή στο category_changes.

Οι βαθμοί του μειώνονται κατά 50% (total_points = total_points * 0.5).

2️⃣ Αλλαγή κατηγορίας κιλών

Αν αλλάξει weight category, τότε αφαιρούμε 25% (total_points = total_points * 0.75).

3️⃣ Ετήσια μείωση 25% για Ανδρών/Γυναικών

Κάθε χρόνο, όσοι είναι σε ηλικιακή κατηγορία Ανδρών/Γυναικών μειώνονται 25%.

4️⃣ Συμμετοχή / Νίκες / Θέση

placement_points πίνακας για τις θέσεις (1η, 2η, 3η, 5η, 7η, 9η).

win_points πίνακας για τις νίκες (1–5).

+4 βαθμοί για συμμετοχή (αν participated = 1).

5️⃣ Μη συμμετοχή για 2 χρόνια = μηδενισμός

Αν last_national_participation_date > 2 έτη → total_points = 0.

6️⃣ Εξαίρεση από κατηγορία (Coach override)

Αν στο tournament_registrations.override_allowed = 1 →
ο αθλητής μπορεί να συμμετάσχει σε άλλη κατηγορία χωρίς απώλεια βαθμών.