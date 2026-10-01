# Research A33: M03 chart bundle bound to one verified metric set

A33 converts one exact A32 `metricSetSha256` into three closed chart-data specs:
observed revenue by ALL/WIDE/CORE, observed units by ALL/WIDE/CORE, and revenue
membership sensitivity from ALL to WIDE/CORE.

The builder does no database read, source parsing, market calculation, AI call or
style generation. It verifies the complete metric-set content identity before
copying values. A null value remains null and must render as missing, never as
zero. Scope bars must not be stacked or summed because the scopes overlap. The
sensitivity chart is not growth, forecast or causation.

The outside-Git CLI writes one new 0600 JSON file and refuses overwrite. Visual
rendering, accessibility text, report composition and narrative are later
consumers of this exact chart-bundle identity.
