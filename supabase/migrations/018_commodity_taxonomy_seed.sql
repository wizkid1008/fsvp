-- ============================================================================
-- 018: A starter commodity taxonomy
--
-- WHY THIS IS SAFE TO SEED, WHEN country_commodity_rules IS NOT
--
-- docs/reference-layer-curation.md argues, correctly, that the reference layer
-- must not be seeded without a curation process: "an empty table is honest, a
-- wrong table is dangerous... an importer told 'permitted, no permit required'
-- by a row nobody has checked since 2024 stops looking."
--
-- That argument is about country_commodity_rules, which makes REGULATORY
-- CLAIMS — what may enter, from where, under what treatment. This table makes
-- none. "Coffee, roasted — seed — not propagative — beverage" is a taxonomy
-- fact: it says what the thing IS, not what may be done with it. An FDA
-- investigator cannot be misled by it, because it asserts nothing they would
-- check.
--
-- The distinction matters because the empty taxonomy blocks the entire
-- product. No commodity means no classification, which means no admissibility
-- determination, which means no FSVP record — every product stops at step 4 of
-- 11. country_commodity_rules stays empty, and the UI continues to say "no rule
-- on file" rather than implying anything about entry.
--
-- WHAT IS AND IS NOT CLAIMED HERE
--
-- Claimed: the common name, the broad class, which part enters, and whether it
-- is propagative. Those last two are part of a rule's identity — APHIS treats
-- mango fruit and mango leaves as different things, and anything capable of
-- growing far more strictly than the same species as food — so they are set
-- deliberately rather than left null.
--
-- NOT claimed: scientific names are given only where unambiguous, and FDA
-- product codes are left null throughout. A product code is an assertion about
-- FDA classification, which is the kind of thing this migration is careful not
-- to make. An administrator adds them per commodity as they are verified.
--
-- Idempotent: ux_commodities_identity is (lower(common_name), plant_part,
-- is_propagative), so re-running changes nothing.
-- ============================================================================

begin;

insert into commodities
  (common_name, scientific_name, commodity_class, plant_part, is_propagative, notes)
values
  -- ── Beverages and their raw forms ────────────────────────────────────────
  -- Green and roasted coffee are separate commodities on purpose: processing
  -- state changes both the applicable requirements and the hazard profile.
  ('Coffee, green',            'Coffea arabica',        'beverage',       'seed',           false, 'Unroasted. Distinct from roasted for admissibility and hazard purposes.'),
  ('Coffee, roasted',          'Coffea arabica',        'beverage',       'seed',           false, null),
  ('Tea',                      'Camellia sinensis',     'beverage',       'leaf',           false, null),
  ('Cocoa beans',              'Theobroma cacao',       'processed_food', 'seed',           false, 'Fermented and dried beans, before grinding.'),
  ('Cocoa nibs',               'Theobroma cacao',       'processed_food', 'seed',           false, null),
  ('Cocoa powder',             'Theobroma cacao',       'processed_food', 'not_applicable', false, 'Ground and defatted. No longer identifiable as a plant part.'),

  -- ── Fruit ────────────────────────────────────────────────────────────────
  ('Mango, fresh',             'Mangifera indica',      'fruit',          'fruit',          false, null),
  ('Mango, dried',             'Mangifera indica',      'processed_food', 'fruit',          false, null),
  ('Mango puree',              'Mangifera indica',      'processed_food', 'not_applicable', false, null),
  ('Banana, fresh',            'Musa acuminata',        'fruit',          'fruit',          false, null),
  ('Avocado, fresh',           'Persea americana',      'fruit',          'fruit',          false, null),
  ('Pineapple, fresh',         'Ananas comosus',        'fruit',          'fruit',          false, null),
  ('Grapes, table',            'Vitis vinifera',        'fruit',          'fruit',          false, null),
  ('Berries, dried mixed',      null,                    'processed_food', 'fruit',          false, 'Mixed species — record the constituents in the product record.'),
  ('Blueberry, fresh',         'Vaccinium corymbosum',  'fruit',          'fruit',          false, null),
  ('Strawberry, fresh',        'Fragaria x ananassa',   'fruit',          'fruit',          false, null),

  -- ── Vegetables ───────────────────────────────────────────────────────────
  -- Seed potato is propagative and regulated far more strictly than the same
  -- species as food, which is exactly why is_propagative is part of identity.
  ('Potato, table',            'Solanum tuberosum',     'vegetable',      'tuber',          false, null),
  ('Potato, seed',             'Solanum tuberosum',     'vegetable',      'tuber',          true,  'Propagative. Materially different requirements from table potato.'),
  ('Tomato, fresh',            'Solanum lycopersicum',  'vegetable',      'fruit',          false, 'Botanically a fruit; enters as a vegetable commodity.'),
  ('Pepper, fresh',            'Capsicum annuum',       'vegetable',      'fruit',          false, null),
  ('Pepper, roasted strips',   'Capsicum annuum',       'processed_food', 'fruit',          false, null),
  ('Onion, bulb',              'Allium cepa',           'vegetable',      'bulb',           false, null),
  ('Garlic, bulb',             'Allium sativum',        'vegetable',      'bulb',           false, null),
  ('Carrot, fresh',            'Daucus carota',         'vegetable',      'root',           false, null),

  -- ── Nuts and seeds ───────────────────────────────────────────────────────
  ('Peanut, raw',              'Arachis hypogaea',      'nut',            'seed',           false, 'Botanically a legume. Major allergen under FDA labelling rules.'),
  ('Peanut, roasted',          'Arachis hypogaea',      'nut',            'seed',           false, 'Major allergen.'),
  ('Almond',                   'Prunus dulcis',         'nut',            'seed',           false, 'Tree nut — major allergen.'),
  ('Cashew',                   'Anacardium occidentale','nut',            'seed',           false, 'Tree nut — major allergen.'),
  ('Sesame seed',              'Sesamum indicum',       'herb_spice',     'seed',           false, 'Major allergen since the FASTER Act 2021.'),

  -- ── Grains ───────────────────────────────────────────────────────────────
  ('Rice, milled',             'Oryza sativa',          'grain',          'seed',           false, null),
  ('Wheat, grain',             'Triticum aestivum',     'grain',          'seed',           false, 'Gluten-containing.'),
  ('Quinoa',                   'Chenopodium quinoa',    'grain',          'seed',           false, null),
  ('Maize, grain',             'Zea mays',              'grain',          'seed',           false, null),

  -- ── Herbs and spices ─────────────────────────────────────────────────────
  ('Black pepper',             'Piper nigrum',          'herb_spice',     'fruit',          false, null),
  ('Cinnamon',                 'Cinnamomum verum',      'herb_spice',     'stem',           false, 'Bark. Recorded as stem — the taxonomy has no bark value.'),
  ('Turmeric, dried',          'Curcuma longa',         'herb_spice',     'root',           false, 'Rhizome.'),
  ('Vanilla bean',             'Vanilla planifolia',    'herb_spice',     'fruit',          false, null),
  ('Oregano, dried',           'Origanum vulgare',      'herb_spice',     'leaf',           false, null),

  -- ── Other classes, present so the class list is exercised ────────────────
  ('Shrimp, frozen',            null,                    'seafood',        'not_applicable', false, 'Species varies — record it on the product.'),
  ('Honey',                     null,                    'other',          'not_applicable', false, null),
  ('Olive oil',                'Olea europaea',         'processed_food', 'fruit',          false, null)

on conflict do nothing;

commit;
