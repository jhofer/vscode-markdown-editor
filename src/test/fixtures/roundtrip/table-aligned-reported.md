# Auth

The workspace owns the space and its permissions, not the individual user.

## Identities in play

| Identity             | Type                             | Who uses it                                                                                            | For                                                                        |
| -------------------- | -------------------------------- | ------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------- |
| **Signed-in user**   | Delegated (user) token           | `upload-spa`, `open-pcf` → `api-backend`; and the record create (via impersonation)                    | Authenticating the real user to the backend, and owning the created record |
| **App registration** | App-only token                   | `api-backend` → the graph API                                                                          | Reading the site collection                                                |
