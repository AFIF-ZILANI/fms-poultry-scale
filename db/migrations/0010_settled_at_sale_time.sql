-- A sale settles when it is recorded: the app has no step anywhere that takes
-- a payment afterwards, so `received_amount` could never be paid down and a
-- gap under `final_amount` was reading as a permanent debt. It is a discount.
--
-- Existing rows stored 0 whenever the farmer left the optional field alone,
-- which under the new reading would show the entire sale as money given away.
-- Blank meant "the buyer paid it all", so record that.
UPDATE `sale_meta_data` SET `received_amount` = `final_amount` WHERE `received_amount` = 0;
