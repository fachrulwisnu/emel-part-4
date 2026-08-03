-- =======================================================================
-- SAAS MULTI-TENANT EMAIL AI AUTOMATION - DATABASE SCHEMA DUMP (POSTGRESQL)
-- =======================================================================

-- 1. Enable Required Extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 2. Tenants Table (Multi-Tenant Architecture)
CREATE TABLE IF NOT EXISTS tenants (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Seed Default Global Tenant
INSERT INTO tenants (id, name) 
VALUES (1, 'Super Admin / Global') 
ON CONFLICT (id) DO NOTHING;

-- 3. Mail Configurations Table (Multi-Account Fetcher)
CREATE TABLE IF NOT EXISTS mail_configs (
    id SERIAL PRIMARY KEY,
    tenant_id INT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    email_address VARCHAR(255) NOT NULL,
    host VARCHAR(255) NOT NULL,
    port INT NOT NULL DEFAULT 995,
    username VARCHAR(255) NOT NULL,
    password VARCHAR(255) NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 4. Custom Filters Table (Dynamic Routing & Rules)
CREATE TABLE IF NOT EXISTS custom_filters (
    id SERIAL PRIMARY KEY,
    tenant_id INT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    match_from TEXT,
    match_subject TEXT,
    match_body TEXT,
    action_parent VARCHAR(255) NOT NULL,
    action_child VARCHAR(255) NOT NULL,
    trigger_api BOOLEAN DEFAULT FALSE,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 5. Emails Table (Core Data & Multi-Order / Auto-Tagging)
CREATE TABLE IF NOT EXISTS emails (
    id SERIAL PRIMARY KEY,
    tenant_id INT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    message_id VARCHAR(255) UNIQUE NOT NULL,
    subject TEXT,
    sender VARCHAR(255),
    sender_email VARCHAR(255),
    body_text TEXT,
    body_html TEXT,
    date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    status VARCHAR(50) DEFAULT 'PENDING',
    
    -- Auto-Tagging & Folder Classification
    folder VARCHAR(255),
    sub_folder VARCHAR(255),
    folder_parent VARCHAR(255),
    folder_child VARCHAR(255),
    suggested_folder_parent VARCHAR(255),
    suggested_folder_child VARCHAR(255),
    
    -- Multi-Order Processing Fields
    target_tickets INT DEFAULT 1,
    processed_tickets INT DEFAULT 0,
    order_status VARCHAR(50) DEFAULT 'OPEN',
    
    -- Multi-Account Tracking
    source_email VARCHAR(255),
    
    -- AI Analysis Output Metadata
    is_important BOOLEAN DEFAULT FALSE,
    urgency_level VARCHAR(50) DEFAULT 'MEDIUM',
    action_required BOOLEAN DEFAULT FALSE,
    is_cit_order BOOLEAN DEFAULT FALSE,
    summary TEXT,
    tags JSONB DEFAULT '[]'::jsonb,
    ai_raw_response JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 6. Daily Summaries Table
CREATE TABLE IF NOT EXISTS daily_summaries (
    id SERIAL PRIMARY KEY,
    tenant_id INT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    summary_text TEXT NOT NULL,
    source_email_ids TEXT[], -- Array of Message IDs / Email IDs used for history tracking
    date VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 7. Performance Indexes
CREATE INDEX IF NOT EXISTS idx_emails_tenant_id ON emails(tenant_id);
CREATE INDEX IF NOT EXISTS idx_emails_message_id ON emails(message_id);
CREATE INDEX IF NOT EXISTS idx_emails_folder ON emails(folder, sub_folder);
CREATE INDEX IF NOT EXISTS idx_emails_source_email ON emails(source_email);
CREATE INDEX IF NOT EXISTS idx_mail_configs_tenant_id ON mail_configs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_custom_filters_tenant_id ON custom_filters(tenant_id);
CREATE INDEX IF NOT EXISTS idx_daily_summaries_tenant_id ON daily_summaries(tenant_id);
