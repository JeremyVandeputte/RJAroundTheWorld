// User-facing texts (French only) for results returned by the server.
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from "./password-rules";

function minutes(ms: number): string {
  const value = Math.max(1, Math.ceil(ms / 60_000));
  return `${value} minute${value > 1 ? "s" : ""}`;
}

export const messages = {
  rateLimited: (retryAfterMs: number) => `Trop de tentatives. Réessayez dans ${minutes(retryAfterMs)}.`,
  login: {
    missing_fields: "Saisissez votre identifiant et votre mot de passe.",
    invalid_credentials: "Identifiant ou mot de passe incorrect.",
  },
  password: {
    missing_fields: "Remplissez les trois champs.",
    wrong_current_password: "Le mot de passe actuel est incorrect.",
    confirmation_mismatch: "Les deux saisies du nouveau mot de passe ne correspondent pas.",
    same_as_current: "Le nouveau mot de passe doit être différent de l'actuel.",
    password_too_short: `Le mot de passe doit contenir au moins ${PASSWORD_MIN_LENGTH} caractères.`,
    password_too_long: `Le mot de passe est trop long (${PASSWORD_MAX_LENGTH} caractères au maximum).`,
    password_too_common: "Ce mot de passe est trop courant ou trop facile à deviner. Choisissez-en un autre.",
    changed: "Votre mot de passe a été modifié.",
  },
  user: {
    invalid_username:
      "L'identifiant doit contenir entre 3 et 30 caractères : lettres minuscules, chiffres, point, tiret ou tiret bas.",
    username_taken: "Cet identifiant est déjà utilisé.",
    invalid_display_name: "Le nom affiché doit contenir entre 1 et 50 caractères.",
    user_not_found: "Ce compte n'existe pas.",
  },
  trip: {
    forbidden: "Vous n'avez pas la permission de gérer les voyages.",
    trip_not_found: "Ce voyage n'existe pas.",
    trip_has_entries:
      "Ce voyage contient des entrées : seul l'administrateur peut le supprimer avec son contenu.",
    invalid_title: "Le titre du voyage doit contenir entre 1 et 100 caractères.",
    invalid_description: "La description ne doit pas dépasser 500 caractères.",
    invalid_dates: "Indiquez une date de début et une date de fin valides.",
    end_before_start: "La date de fin ne peut pas précéder la date de début.",
  },
  entry: {
    forbidden: "Vous n'avez pas le droit de modifier cette entrée.",
    not_found: "Cette entrée n'existe pas.",
    invalid_date: "Indiquez une date valide.",
    invalid_title: "Le titre doit contenir entre 1 et 150 caractères.",
    body_too_long: "Le texte est trop long (20 000 caractères au maximum).",
    invalid_point:
      "Les coordonnées d'un lieu sont invalides : latitude entre -90 et 90, longitude entre -180 et 180, nom de 100 caractères au maximum.",
    point_b_requires_a: "Indiquez d'abord le point A avant le point B.",
    location_required: "Un lieu (point A) est nécessaire pour qu'une entrée soit publiée.",
    invalid_people: "Une des personnes identifiées n'existe pas.",
  },
  admin: {
    forbidden: "Cette action est réservée à l'administrateur.",
    cannot_target_superuser: "Cette action n'est pas possible sur le compte administrateur.",
    has_entries:
      "Ce compte a écrit des entrées du journal : il ne peut pas être supprimé. Désactivez-le à la place.",
    permissions_saved: "Permissions enregistrées.",
    account_deactivated: "Compte désactivé. Ses sessions ont été fermées.",
    account_reactivated: "Compte réactivé.",
    change_forced: "Ce compte devra choisir un nouveau mot de passe avant de continuer.",
    account_created: (username: string) => `Compte « ${username} » créé.`,
    password_reset: "Mot de passe réinitialisé. Les sessions de ce compte ont été fermées.",
  },
} as const;
