**Seguridad y estructura recomendada para secretos**

- Mantener fuera del repositorio cualquier secreto (service account JSON, tokens, claves privadas).
- Estructura recomendada:

  project/
  ├── src/
  ├── config/
  │    └── firebase.json    ← Service account JSON (gitignored)
  │    └── secrets.json     ← Local secrets (gitignored)
  ├── .env                  ← Local env references (gitignored)
  ├── .env.example          ← Plantilla sin secretos (tracked)
  └── SECURITY.md

- Variables que el backend necesita (guardar en `.env` o `config/secrets.json`):
  - `PORT`
  - `NODE_ENV`
  - `GOOGLE_APPLICATION_CREDENTIALS` (ruta relativa al JSON de service account)
  - `TWILIO_ACCOUNT_SID`
  - `TWILIO_AUTH_TOKEN`
  - `TWILIO_FROM_NUMBER`

- Por qué eliminar las variables de frontend del backend:
  - Las variables como `FIREBASE_API_KEY`, `authDomain`, `appId` son para el SDK cliente (navegador/móvil).
  - No aportan valor al backend y sólo aumentan la superficie de configuración y riesgo de fuga.

- Buenas prácticas:
  - Usar un gestor de secretos (HashiCorp Vault, AWS Secrets Manager, Azure Key Vault, GCP Secret Manager) en producción.
  - Para desarrollo local usar `config/secrets.json` (gitignored) o un `.env` local no comiteado.
  - Rotar claves comprometidas inmediatamente: revocar la key del service account en Firebase Console y regenerar el `TWILIO_AUTH_TOKEN` desde Twilio Console.

  ## Pasos concretos de remediación inmediata

  1. Eliminar el fichero de service account del repositorio (ya realizado).
  2. Rotar la clave del service account en GCP:
    - Accede a Google Cloud Console → IAM & Admin → Service Accounts.
    - Localiza la cuenta de servicio afectada y revoca/borra la clave comprometida.
    - Genera una nueva clave JSON y almacénala de forma segura en un Secret Manager.
    - Actualiza `GOOGLE_APPLICATION_CREDENTIALS` en los entornos (CI/CD, servidores) para apuntar al secreto desplegado.
  3. Rotar credenciales de Twilio:
    - Entra en Twilio Console → Project → API Keys / Auth Tokens.
    - Regenera `TWILIO_AUTH_TOKEN` y actualiza los secretos en el gestor de secretos o en el panel CI.
    - Revoke any old tokens if possible.
  4. Configurar almacenamiento de secretos en producción:
    - Usar GCP Secret Manager, AWS Secrets Manager o Azure Key Vault.
    - En CI/CD, configurar variables protegidas (GitHub Actions Secrets, GitLab CI variables, etc.).
  5. Verificar y desplegar:
    - Actualizar los servicios para leer credenciales desde el Secret Manager o variables de entorno gestionadas por CI.
    - Reiniciar servicios y validar que la app arranca y `firebaseAdmin` se inicializa correctamente.

  ## Comprobaciones post-rotación

  - Ejecutar `gcloud iam service-accounts keys list --iam-account=<SERVICE_ACCOUNT_EMAIL>` para confirmar que la clave antigua fue revocada.
  - Validar en Twilio que la(s) credencial(es) antiguas ya no autorizan llamadas.
  - Revisar logs de acceso y alertas para detectar posible uso indebido.

  Si quieres, puedo generar comandos/guión para automatizar parte de estos pasos (por ejemplo: plantilla de Terraform/`gcloud` para crear secret, o instrucciones para GitHub Actions). 

- Ejemplo rápido para restaurar localmente (no ejecutar en CI):
  1. Copiar plantilla: `cp .env.example .env`
  2. Crear `config/firebase.json` con el service account (asegúrate de que `config/firebase.json` esté en `.gitignore`).
  3. Añadir valores reales en `config/secrets.json` o en `.env` local.
