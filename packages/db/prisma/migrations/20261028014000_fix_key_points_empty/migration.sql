-- The table rebuild in the previous migration left copied rows with an empty string
-- (not valid JSON) in "keyPoints". Normalise them to an empty array.
UPDATE "intakes" SET "keyPoints" = '[]' WHERE "keyPoints" = '';
