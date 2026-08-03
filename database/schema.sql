-- =========================================================================
-- ENTERPRISE MULTI-TENANT SAAS EMAIL AI AUTOMATION - DATABASE SCHEMA DUMP
-- Database System: PostgreSQL 12+
-- Required Extensions: pgcrypto, uuid-ossp
-- =========================================================================

-- 1. Initialize Required PostgreSQL Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- -------------------------------------------------------------------------
-- TABLE: tenants
-- Purpose: Stores multi-tenant corporate divisions / organizations (e.g., COS, RH, BM).
-- Contains tenant-specific AI model permissions, POP3 email credentials, and WhatsApp settings.
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.tenants (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) UNIQUE NOT NULL,
    ai_primary_model VARCHAR(100) DEFAULT 'Custom AI Core',
    ai_fallback_model VARCHAR(100) DEFAULT 'Nemotron 3 Super 120B',
    ai_models JSONB DEFAULT '["Custom AI Core", "Nemotron 3 Super 120B"]'::jsonb,
    feature_individual_parsing BOOLEAN DEFAULT FALSE,
    feature_bulk_summary BOOLEAN DEFAULT FALSE,
    pop3_host VARCHAR(255) DEFAULT '',
    pop3_port INTEGER DEFAULT 110,
    pop3_user VARCHAR(255) DEFAULT '',
    pop3_pass VARCHAR(255) DEFAULT '',
    wa_phone VARCHAR(50) DEFAULT '',
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Comments on tenants table columns
COMMENT ON TABLE public.tenants IS 'Stores corporate tenants/divisions with dedicated AI permissions and email credentials.';
COMMENT ON COLUMN public.tenants.ai_models IS 'List of LLM models allocated to this tenant by Super Admin.';

-- -------------------------------------------------------------------------
-- TABLE: users
-- Purpose: User accounts with Role-Based Access Control (RBAC).
-- Roles: SUPER_ADMIN (System-wide control), TENANT_ADMIN (Division-level control).
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.users (
    id SERIAL PRIMARY KEY,
    tenant_id INTEGER REFERENCES public.tenants(id) ON DELETE CASCADE,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role VARCHAR(50) NOT NULL CHECK (role IN ('SUPER_ADMIN', 'TENANT_ADMIN')),
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Comments on users table
COMMENT ON TABLE public.users IS 'User authentication and RBAC roles linked to specific tenants or global Super Admin.';

-- -------------------------------------------------------------------------
-- TABLE: emails
-- Purpose: Core storage for fetched raw emails, extracted operational CIT/ATM data, and AI analysis status.
-- Includes unique constraint (tenant_id, message_id) to prevent duplicate processing per tenant.
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.emails (
    id SERIAL PRIMARY KEY,
    tenant_id INTEGER REFERENCES public.tenants(id) ON DELETE CASCADE,
    message_id VARCHAR(255) NOT NULL,
    uid VARCHAR(255),
    subject TEXT,
    sender TEXT,
    receiver TEXT,
    date TIMESTAMPTZ,
    body_text TEXT,
    html_body TEXT,
    tags JSONB DEFAULT '[]'::jsonb,
    category VARCHAR(100),
    sub_category VARCHAR(100),
    folder_parent VARCHAR(100),
    folder_child VARCHAR(100),
    api_workflow_status VARCHAR(50),
    api_workflow_log TEXT,
    attachments JSONB DEFAULT '[]'::jsonb,
    is_read BOOLEAN DEFAULT FALSE,
    tag_type VARCHAR(100),
    summary TEXT,
    action_required BOOLEAN DEFAULT FALSE,
    suggested_tag VARCHAR(100),
    is_important BOOLEAN DEFAULT FALSE,
    urgency_level VARCHAR(50),
    suggested_folder_parent VARCHAR(100),
    suggested_folder_child VARCHAR(100),
    is_cit_order BOOLEAN DEFAULT FALSE,
    cit_type VARCHAR(100),
    suggested_bank VARCHAR(150),
    extracted_notes TEXT,
    currency VARCHAR(10) DEFAULT 'IDR',
    denomination_suggestion BIGINT,
    total_amount BIGINT,
    ai_status VARCHAR(50) DEFAULT 'PENDING',
    is_summarized BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT unique_tenant_message UNIQUE (tenant_id, message_id)
);

-- Indexes for emails table performance optimization
CREATE INDEX IF NOT EXISTS idx_emails_tenant_id ON public.emails(tenant_id);
CREATE INDEX IF NOT EXISTS idx_emails_message_id ON public.emails(message_id);
CREATE INDEX IF NOT EXISTS idx_emails_date ON public.emails(date DESC);
CREATE INDEX IF NOT EXISTS idx_emails_ai_status ON public.emails(ai_status);

COMMENT ON TABLE public.emails IS 'Stores fetched incoming emails, AI extraction status, and operational CIT order ticket data.';

-- -------------------------------------------------------------------------
-- TABLE: custom_filters
-- Purpose: Dynamic keywords and rules for filtering incoming emails per tenant.
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.custom_filters (
    id SERIAL PRIMARY KEY,
    tenant_id INTEGER REFERENCES public.tenants(id) ON DELETE CASCADE,
    name VARCHAR(150),
    match_from TEXT,
    match_subject TEXT,
    match_body TEXT,
    action_parent VARCHAR(100),
    action_child VARCHAR(100),
    trigger_api INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

COMMENT ON TABLE public.custom_filters IS 'Tenant-specific custom filtering rules for email tagging and folder organization.';

-- -------------------------------------------------------------------------
-- TABLE: email_analysis
-- Purpose: Deep analysis results, attachment summaries, and metadata produced by AI workers.
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.email_analysis (
    id SERIAL PRIMARY KEY,
    tenant_id INTEGER REFERENCES public.tenants(id) ON DELETE CASCADE,
    message_id VARCHAR(255) UNIQUE NOT NULL,
    folder VARCHAR(100),
    sub_folder VARCHAR(100),
    tags JSONB DEFAULT '[]'::jsonb,
    summary_email TEXT,
    summary_attachments JSONB DEFAULT '[]'::jsonb,
    attachment_summary JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

COMMENT ON TABLE public.email_analysis IS 'Detailed AI structured analysis output and attachment processing logs.';

-- -------------------------------------------------------------------------
-- TABLE: wa_sessions
-- Purpose: Active WhatsApp Web session credentials for WhatsApp Report Gateway per tenant.
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.wa_sessions (
    id SERIAL PRIMARY KEY,
    tenant_id INTEGER REFERENCES public.tenants(id) ON DELETE CASCADE,
    session_id VARCHAR(255) UNIQUE NOT NULL,
    creds JSONB,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

COMMENT ON TABLE public.wa_sessions IS 'Stores WhatsApp Web authentication tokens and session state per tenant.';

-- -------------------------------------------------------------------------
-- TABLE: daily_summaries
-- Purpose: Executive daily bulk summaries compiled by AI for RH/BM management divisions.
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.daily_summaries (
    id SERIAL PRIMARY KEY,
    tenant_id INTEGER REFERENCES public.tenants(id) ON DELETE CASCADE,
    summary_date DATE NOT NULL,
    content_text TEXT NOT NULL,
    is_sent_to_wa BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_daily_summaries_tenant_date ON public.daily_summaries(tenant_id, summary_date DESC);

COMMENT ON TABLE public.daily_summaries IS 'Stores generated daily executive bulk summaries and WhatsApp blast logs per tenant.';

-- -------------------------------------------------------------------------
-- INITIAL SEED DATA
-- Default tenants and administrator accounts initialized via pgcrypto
-- -------------------------------------------------------------------------
INSERT INTO public.tenants (name, ai_primary_model, ai_fallback_model, feature_individual_parsing, feature_bulk_summary) 
VALUES 
    ('COS', 'Custom AI Core', 'Nemotron 3 Super 120B', TRUE, FALSE),
    ('RH', 'Custom AI Core', 'Nemotron 3 Super 120B', FALSE, TRUE),
    ('BM', 'Custom AI Core', 'Nemotron 3 Super 120B', FALSE, TRUE)
ON CONFLICT (name) DO NOTHING;

-- Default Users (Super Admin & Tenant Admin)
INSERT INTO public.users (tenant_id, email, password_hash, role) 
VALUES 
    (NULL, 'fachrul', crypt('bosskubabi', gen_salt('bf')), 'SUPER_ADMIN'),
    ((SELECT id FROM public.tenants WHERE name = 'COS'), 'cos', crypt('12345678', gen_salt('bf')), 'TENANT_ADMIN')
ON CONFLICT (email) DO NOTHING;

-- End of Schema Dump
