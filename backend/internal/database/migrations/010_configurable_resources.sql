CREATE TABLE IF NOT EXISTS resources (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    group_id UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    url TEXT NOT NULL,
    normalized_url TEXT NOT NULL,
    final_url TEXT,
    title TEXT NOT NULL DEFAULT '',
    description TEXT NOT NULL DEFAULT '',
    resource_type TEXT NOT NULL DEFAULT 'link',
    provider TEXT NOT NULL DEFAULT '',
    mime_type TEXT NOT NULL DEFAULT '',
    thumbnail_url TEXT NOT NULL DEFAULT '',
    original_comment TEXT NOT NULL DEFAULT '',
    source_type TEXT NOT NULL DEFAULT 'manual',
    source_author TEXT NOT NULL DEFAULT '',
    source_date TIMESTAMPTZ,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (group_id, normalized_url)
);

CREATE INDEX IF NOT EXISTS resources_group_created_idx
    ON resources(group_id, created_at DESC);
CREATE INDEX IF NOT EXISTS resources_group_type_idx
    ON resources(group_id, resource_type);

CREATE TABLE IF NOT EXISTS custom_fields (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    group_id UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    slug TEXT NOT NULL,
    field_type TEXT NOT NULL CHECK (field_type IN (
        'single_select', 'multi_select', 'text', 'number', 'date', 'boolean'
    )),
    is_required BOOLEAN NOT NULL DEFAULT FALSE,
    is_filterable BOOLEAN NOT NULL DEFAULT TRUE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (group_id, slug)
);

CREATE INDEX IF NOT EXISTS custom_fields_group_order_idx
    ON custom_fields(group_id, sort_order, name);

CREATE TABLE IF NOT EXISTS custom_field_options (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    field_id UUID NOT NULL REFERENCES custom_fields(id) ON DELETE CASCADE,
    label TEXT NOT NULL,
    value TEXT NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (field_id, value)
);

CREATE INDEX IF NOT EXISTS custom_field_options_field_order_idx
    ON custom_field_options(field_id, sort_order, label);

CREATE TABLE IF NOT EXISTS resource_field_values (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    resource_id UUID NOT NULL REFERENCES resources(id) ON DELETE CASCADE,
    field_id UUID NOT NULL REFERENCES custom_fields(id) ON DELETE CASCADE,
    option_id UUID REFERENCES custom_field_options(id) ON DELETE CASCADE,
    text_value TEXT,
    number_value NUMERIC,
    date_value DATE,
    boolean_value BOOLEAN,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (
        option_id IS NOT NULL OR
        text_value IS NOT NULL OR
        number_value IS NOT NULL OR
        date_value IS NOT NULL OR
        boolean_value IS NOT NULL
    )
);

CREATE INDEX IF NOT EXISTS resource_field_values_resource_idx
    ON resource_field_values(resource_id);
CREATE INDEX IF NOT EXISTS resource_field_values_filter_idx
    ON resource_field_values(field_id, option_id);

CREATE TABLE IF NOT EXISTS tags (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    group_id UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    normalized_name TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (group_id, normalized_name)
);

CREATE TABLE IF NOT EXISTS resource_tags (
    resource_id UUID NOT NULL REFERENCES resources(id) ON DELETE CASCADE,
    tag_id UUID NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
    PRIMARY KEY (resource_id, tag_id)
);

CREATE TABLE IF NOT EXISTS import_batches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    group_id UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    source_type TEXT NOT NULL DEFAULT 'whatsapp',
    name TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
        'pending', 'processing', 'ready_for_review', 'completed', 'failed', 'cancelled'
    )),
    total_items INTEGER NOT NULL DEFAULT 0,
    processed_items INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS import_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    batch_id UUID NOT NULL REFERENCES import_batches(id) ON DELETE CASCADE,
    original_url TEXT NOT NULL,
    normalized_url TEXT NOT NULL,
    message_text TEXT NOT NULL DEFAULT '',
    sender_name TEXT NOT NULL DEFAULT '',
    shared_at TIMESTAMPTZ,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
        'pending', 'inspecting', 'ready', 'incomplete', 'duplicate', 'unreachable', 'approved', 'discarded'
    )),
    inspection JSONB NOT NULL DEFAULT '{}'::jsonb,
    error_message TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS import_items_batch_status_idx
    ON import_items(batch_id, status);
