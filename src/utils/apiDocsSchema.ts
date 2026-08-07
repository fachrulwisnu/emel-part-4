export const apiDocsSchema = {
  "openapi": "3.0.0",
  "info": {
    "title": "Email Engine Integration API",
    "version": "1.0.0",
    "description": "Dokumentasi API resmi untuk integrasi lintas-layanan (seperti DCT Web dan Telegram) dengan Email Ticketing & AI Engine."
  },
  "components": {
    "securitySchemes": {
      "ApiKeyAuth": {
        "type": "apiKey",
        "in": "header",
        "name": "X-DCT-API-KEY",
        "description": "Masukkan API Key rahasia untuk mengakses endpoint ini."
      }
    }
  },
  "security": [ { "ApiKeyAuth": [] } ],
  "paths": {
    "/api/integration/dct-summary": {
      "get": {
        "summary": "Check Email & Fetch Daily Summary",
        "description": "Digunakan oleh DCT Web untuk mengecek apakah email terdaftar di Email Engine. Jika terdaftar dan ada summary HARI INI, sistem akan mengembalikan data untuk ditampilkan sebagai Pop-up.",
        "tags": ["Integration"],
        "parameters": [
          {
            "name": "email",
            "in": "query",
            "required": true,
            "schema": { "type": "string" },
            "description": "Email user yang sedang login di DCT Web",
            "example": "budi@advantage.com"
          }
        ],
        "responses": {
          "200": {
            "description": "Berhasil diproses (Mengembalikan instruksi tampil/tidak tampil pop-up)",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "success": { "type": "boolean" },
                    "show_popup": { "type": "boolean" },
                    "message": { "type": "string", "nullable": true },
                    "data": {
                      "type": "object",
                      "nullable": true,
                      "properties": {
                        "summary_html_or_markdown": { "type": "string" },
                        "tenant_id": { "type": "integer" }
                      }
                    }
                  }
                },
                "examples": {
                  "Success_ShowPopup": {
                    "summary": "Email & Summary Ditemukan",
                    "value": {
                      "success": true,
                      "show_popup": true,
                      "data": { "summary_html_or_markdown": "## Rangkuman Hari Ini...", "tenant_id": 1 }
                    }
                  },
                  "Success_NoPopup": {
                    "summary": "Email Tidak Terdaftar",
                    "value": {
                      "success": true,
                      "show_popup": false,
                      "message": "Email not registered in Email Engine"
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  }
};

export default apiDocsSchema;
