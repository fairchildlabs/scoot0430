


DELETE FROM game_players; -- Deletes all game players
DELETE FROM checkins;     -- Deletes all checkins
DELETE FROM games;        -- Deletes all games 
DELETE FROM game_sets;    -- 

ALTER SEQUENCE game_players_id_seq RESTART WITH 1;
ALTER SEQUENCE checkins_id_seq RESTART WITH 1;
ALTER SEQUENCE games_id_seq RESTART WITH 1;
ALTER SEQUENCE game_sets_id_seq RESTART WITH 1;


-- Create game set 1 first if it doesn't exist
INSERT INTO game_sets (id, created_by, players_per_team, gym, max_consecutive_games, time_limit, 
                      win_score, point_system, is_active, number_of_courts, 
                      current_queue_position, queue_next_up)
VALUES (1, 0, 4, 'fonde', 2, 15, 21, '2s and 3s', true, 2, 1, 13);

-- Individual check-ins for each player, starting at position 1
INSERT INTO checkins (user_id, check_in_time, is_active, club_index, check_in_date, game_set_id, queue_position, type)
VALUES (22, NOW(), true, 34, TO_CHAR(NOW(), 'YYYY-MM-DD'), 1, 1, 'manual');

INSERT INTO checkins (user_id, check_in_time, is_active, club_index, check_in_date, game_set_id, queue_position, type)
VALUES (33, NOW(), true, 34, TO_CHAR(NOW(), 'YYYY-MM-DD'), 1, 2, 'manual');

INSERT INTO checkins (user_id, check_in_time, is_active, club_index, check_in_date, game_set_id, queue_position, type)
VALUES (13, NOW(), true, 34, TO_CHAR(NOW(), 'YYYY-MM-DD'), 1, 3, 'manual');

INSERT INTO checkins (user_id, check_in_time, is_active, club_index, check_in_date, game_set_id, queue_position, type)
VALUES (44, NOW(), true, 34, TO_CHAR(NOW(), 'YYYY-MM-DD'), 1, 4, 'manual');

INSERT INTO checkins (user_id, check_in_time, is_active, club_index, check_in_date, game_set_id, queue_position, type)
VALUES (38, NOW(), true, 34, TO_CHAR(NOW(), 'YYYY-MM-DD'), 1, 5, 'manual');

INSERT INTO checkins (user_id, check_in_time, is_active, club_index, check_in_date, game_set_id, queue_position, type)
VALUES (21, NOW(), true, 34, TO_CHAR(NOW(), 'YYYY-MM-DD'), 1, 6, 'manual');

INSERT INTO checkins (user_id, check_in_time, is_active, club_index, check_in_date, game_set_id, queue_position, type)
VALUES (25, NOW(), true, 34, TO_CHAR(NOW(), 'YYYY-MM-DD'), 1, 7, 'manual');

INSERT INTO checkins (user_id, check_in_time, is_active, club_index, check_in_date, game_set_id, queue_position, type)
VALUES (26, NOW(), true, 34, TO_CHAR(NOW(), 'YYYY-MM-DD'), 1, 8, 'manual');

INSERT INTO checkins (user_id, check_in_time, is_active, club_index, check_in_date, game_set_id, queue_position, type)
VALUES (14, NOW(), true, 34, TO_CHAR(NOW(), 'YYYY-MM-DD'), 1, 9, 'manual');

INSERT INTO checkins (user_id, check_in_time, is_active, club_index, check_in_date, game_set_id, queue_position, type)
VALUES (24, NOW(), true, 34, TO_CHAR(NOW(), 'YYYY-MM-DD'), 1, 10, 'manual');

INSERT INTO checkins (user_id, check_in_time, is_active, club_index, check_in_date, game_set_id, queue_position, type)
VALUES (31, NOW(), true, 34, TO_CHAR(NOW(), 'YYYY-MM-DD'), 1, 11, 'manual');

INSERT INTO checkins (user_id, check_in_time, is_active, club_index, check_in_date, game_set_id, queue_position, type)
VALUES (37, NOW(), true, 34, TO_CHAR(NOW(), 'YYYY-MM-DD'), 1, 12, 'manual');

