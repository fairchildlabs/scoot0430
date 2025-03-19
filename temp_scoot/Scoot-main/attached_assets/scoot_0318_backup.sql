--
-- PostgreSQL database dump
--

-- Dumped from database version 16.8
-- Dumped by pg_dump version 16.5

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: checkins; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.checkins (
    id integer NOT NULL,
    user_id integer NOT NULL,
    check_in_time timestamp without time zone NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    club_index integer DEFAULT 34 NOT NULL,
    check_in_date text NOT NULL,
    game_set_id integer DEFAULT 1 NOT NULL,
    queue_position integer DEFAULT 1 NOT NULL,
    game_id integer,
    type text DEFAULT 'manual'::text NOT NULL,
    team integer
);


ALTER TABLE public.checkins OWNER TO neondb_owner;

--
-- Name: checkins_id_seq; Type: SEQUENCE; Schema: public; Owner: neondb_owner
--

CREATE SEQUENCE public.checkins_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.checkins_id_seq OWNER TO neondb_owner;

--
-- Name: checkins_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: neondb_owner
--

ALTER SEQUENCE public.checkins_id_seq OWNED BY public.checkins.id;


--
-- Name: game_players; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.game_players (
    id integer NOT NULL,
    game_id integer NOT NULL,
    user_id integer NOT NULL,
    team integer NOT NULL
);


ALTER TABLE public.game_players OWNER TO neondb_owner;

--
-- Name: game_players_id_seq; Type: SEQUENCE; Schema: public; Owner: neondb_owner
--

CREATE SEQUENCE public.game_players_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.game_players_id_seq OWNER TO neondb_owner;

--
-- Name: game_players_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: neondb_owner
--

ALTER SEQUENCE public.game_players_id_seq OWNED BY public.game_players.id;


--
-- Name: game_sets; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.game_sets (
    id integer NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    created_by integer NOT NULL,
    players_per_team integer DEFAULT 4 NOT NULL,
    gym text DEFAULT 'fonde'::text NOT NULL,
    max_consecutive_team_wins integer DEFAULT 2 NOT NULL,
    time_limit integer DEFAULT 15 NOT NULL,
    win_score integer DEFAULT 21 NOT NULL,
    point_system text DEFAULT '2s and 3s'::text NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    number_of_courts integer DEFAULT 2 NOT NULL,
    current_queue_position integer DEFAULT 1 NOT NULL,
    queue_next_up integer DEFAULT 1 NOT NULL
);


ALTER TABLE public.game_sets OWNER TO neondb_owner;

--
-- Name: game_sets_id_seq; Type: SEQUENCE; Schema: public; Owner: neondb_owner
--

CREATE SEQUENCE public.game_sets_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.game_sets_id_seq OWNER TO neondb_owner;

--
-- Name: game_sets_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: neondb_owner
--

ALTER SEQUENCE public.game_sets_id_seq OWNED BY public.game_sets.id;


--
-- Name: games; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.games (
    id integer NOT NULL,
    set_id integer NOT NULL,
    start_time timestamp without time zone NOT NULL,
    end_time timestamp without time zone,
    team1_score integer,
    team2_score integer,
    club_index integer DEFAULT 34 NOT NULL,
    court text NOT NULL,
    state text DEFAULT 'started'::text NOT NULL
);


ALTER TABLE public.games OWNER TO neondb_owner;

--
-- Name: games_id_seq; Type: SEQUENCE; Schema: public; Owner: neondb_owner
--

CREATE SEQUENCE public.games_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.games_id_seq OWNER TO neondb_owner;

--
-- Name: games_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: neondb_owner
--

ALTER SEQUENCE public.games_id_seq OWNED BY public.games.id;


--
-- Name: session; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.session (
    sid character varying NOT NULL,
    sess json NOT NULL,
    expire timestamp(6) without time zone NOT NULL
);


ALTER TABLE public.session OWNER TO neondb_owner;

--
-- Name: users; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.users (
    id integer NOT NULL,
    username text NOT NULL,
    password text NOT NULL,
    first_name text,
    last_name text,
    email text,
    phone text,
    birth_year integer NOT NULL,
    birth_month integer,
    birth_day integer,
    is_player boolean DEFAULT true NOT NULL,
    is_bank boolean DEFAULT false NOT NULL,
    is_book boolean DEFAULT false NOT NULL,
    is_engineer boolean DEFAULT false NOT NULL,
    is_root boolean DEFAULT false NOT NULL,
    autoup boolean DEFAULT true NOT NULL
);


ALTER TABLE public.users OWNER TO neondb_owner;

--
-- Name: users_id_seq; Type: SEQUENCE; Schema: public; Owner: neondb_owner
--

CREATE SEQUENCE public.users_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.users_id_seq OWNER TO neondb_owner;

--
-- Name: users_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: neondb_owner
--

ALTER SEQUENCE public.users_id_seq OWNED BY public.users.id;


--
-- Name: checkins id; Type: DEFAULT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.checkins ALTER COLUMN id SET DEFAULT nextval('public.checkins_id_seq'::regclass);


--
-- Name: game_players id; Type: DEFAULT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.game_players ALTER COLUMN id SET DEFAULT nextval('public.game_players_id_seq'::regclass);


--
-- Name: game_sets id; Type: DEFAULT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.game_sets ALTER COLUMN id SET DEFAULT nextval('public.game_sets_id_seq'::regclass);


--
-- Name: games id; Type: DEFAULT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.games ALTER COLUMN id SET DEFAULT nextval('public.games_id_seq'::regclass);


--
-- Name: users id; Type: DEFAULT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.users ALTER COLUMN id SET DEFAULT nextval('public.users_id_seq'::regclass);


--
-- Data for Name: checkins; Type: TABLE DATA; Schema: public; Owner: neondb_owner
--

COPY public.checkins (id, user_id, check_in_time, is_active, club_index, check_in_date, game_set_id, queue_position, game_id, type, team) FROM stdin;
9	9	2025-03-17 16:05:06	t	34	2025-03-17	1	13	\N	manual	\N
10	10	2025-03-17 16:05:06	t	34	2025-03-17	1	14	\N	manual	\N
11	11	2025-03-17 16:05:06	t	34	2025-03-17	1	15	\N	manual	\N
12	12	2025-03-17 16:05:07	t	34	2025-03-17	1	16	\N	manual	\N
13	7	2025-03-17 16:05:21	t	34	2025-03-17	1	9	\N	win_promoted	2
14	5	2025-03-17 16:05:22	t	34	2025-03-17	1	10	\N	win_promoted	2
15	6	2025-03-17 16:05:22	t	34	2025-03-17	1	11	\N	win_promoted	2
16	8	2025-03-17 16:05:22	t	34	2025-03-17	1	12	\N	win_promoted	2
1	1	2025-03-17 16:05:03	f	34	2025-03-17	1	1	1	manual	\N
6	6	2025-03-17 16:05:05	f	34	2025-03-17	1	6	1	manual	\N
5	5	2025-03-17 16:05:04	f	34	2025-03-17	1	5	1	manual	\N
7	7	2025-03-17 16:05:05	f	34	2025-03-17	1	7	1	manual	\N
3	3	2025-03-17 16:05:04	f	34	2025-03-17	1	3	1	manual	\N
8	8	2025-03-17 16:05:05	f	34	2025-03-17	1	8	1	manual	\N
4	4	2025-03-17 16:05:04	f	34	2025-03-17	1	4	1	manual	\N
2	2	2025-03-17 16:05:03	f	34	2025-03-17	1	2	1	manual	\N
\.


--
-- Data for Name: game_players; Type: TABLE DATA; Schema: public; Owner: neondb_owner
--

COPY public.game_players (id, game_id, user_id, team) FROM stdin;
1	1	1	1
4	1	7	2
5	1	5	2
3	1	6	2
6	1	4	1
7	1	3	1
8	1	8	2
2	1	2	1
\.


--
-- Data for Name: game_sets; Type: TABLE DATA; Schema: public; Owner: neondb_owner
--

COPY public.game_sets (id, created_at, created_by, players_per_team, gym, max_consecutive_team_wins, time_limit, win_score, point_system, is_active, number_of_courts, current_queue_position, queue_next_up) FROM stdin;
1	2025-03-17 21:04:54.995235	1	4	fonde	2	15	21	2s and 3s	t	2	9	13
\.


--
-- Data for Name: games; Type: TABLE DATA; Schema: public; Owner: neondb_owner
--

COPY public.games (id, set_id, start_time, end_time, team1_score, team2_score, club_index, court, state) FROM stdin;
1	1	2025-03-17 21:05:08.608	2025-03-17 21:05:21.573	6	22	34	1	final
\.


--
-- Data for Name: session; Type: TABLE DATA; Schema: public; Owner: neondb_owner
--

COPY public.session (sid, sess, expire) FROM stdin;
\.


--
-- Data for Name: users; Type: TABLE DATA; Schema: public; Owner: neondb_owner
--

COPY public.users (id, username, password, first_name, last_name, email, phone, birth_year, birth_month, birth_day, is_player, is_bank, is_book, is_engineer, is_root, autoup) FROM stdin;
1	scuzzydude	e6f2039944019b823f9e43d07588a567dbf071ad95e7b476db40308496bb0ebc00a454a2d2d08007fd9f72667b56297b5a427777c3085668770089e2add4617b.541ebb7e821a394e821be3ed5b1e5141	\N	\N	\N	\N	2000	\N	\N	t	f	f	t	t	t
2	bo	d1fcd5eeb7c7ff4951f78fe2dbd0e7b7e54b2e6e5130879a0cf71118b992f916d3ebc32a20d3a858a4cca173266f378e8da734ba44fa211c641129498ee51063.5ff8955813308ae29469a48d53888015					2025	\N	\N	t	f	f	f	f	t
3	kennyg	75bde7698bf3416e712f6440aa5ede2d2369525fcdb6ccc6faa774a237ae9a6a4f42832de10613a6517f19beb344b788956f97a7e6a5f9a6cf88b2019ee0c700.98513004903fb6525a5e611c58579d74					2025	\N	\N	t	f	f	f	f	t
4	hakeem	d81fbb0df6a8a8e6d62bf2e4467e965c41eac88b936514d90afab9424a4db06b9137f7db2fbd6a1738d0ea859fa8a15a97f554cc3aac5e1af5c317f0cef06059.a911970c4beabdeb6e823380458e6dbb					2025	\N	\N	t	f	f	f	f	t
5	mcghee	a2fd5b07c1ba32eaa2aa4a7e57d728a6de578dec11502681df691885a1570c75b389b223bfdaad2edd8bd22d3cb147a193eb9efa3a0ec77bdaf9ebc6efb580ea.82af35532a485e41f0d85c1ef594b53e					1944	\N	\N	t	f	f	f	f	t
6	reggie	bcd33827a957689ce786606dc09721d06bed27fef1010cdc9fb15f78c11bfc4507f90352bcd63de18e0648ce16017de6c6a3ae45c72ab6d56c538648adf16472.0ab63fdae8d5cdd7730f7b5acdccf8de					2025	\N	\N	t	f	f	f	f	t
7	charles	959b5b773056553cf2ff766c19f89495c43f543292b0d6093f88a8deb8752d5e890f04017575febf6ed16912f7d7c77db99e874904541e34d50a54d44f121c0d.a370e5f15580064bae46df22e8f3810e					2025	\N	\N	t	f	f	f	f	t
8	mp3	1482ac66d6815d6172a809ea05d81d4b984997ad3ccf6410f290954752e534fb11999dd0d805803e685686fc1f2d001723ef491ead2bf0c4449014d5ce17d7a3.de97275aa78a3f2bae3e89c338d0a9c8					2025	\N	\N	t	f	f	f	f	t
9	jennifer	9db70b4390e327ab4eb0c0c2b64d60e3e5803e90f6f2c7ff38df057f7dcd7e6213e186694d1b29bb9d7f1e0c08077c2bcb1f942b87a2e901c75f3896b217d7ff.73a441bb74195e4be68c2065e6a443df					2025	\N	\N	t	f	f	f	f	t
10	cleo	f514e6b43f4c0c4297da0947498a7bd27d8d08a08f60ce327856f2929c737770c09db9c8501f7bd2dcc8650ef2134341f150da893a6bfcbf778b420b100c3069.f5b3bf4f6dee867d4f61c1ee366a483f					1945	\N	\N	t	f	f	f	f	t
11	zelle	5c15e88ccfc458d0f0fe6a9b4c54a8addf683101e2f0d4bbcd4116095438253370dc98174a90954e999c44f126af8dd6cf5bf6550cfb1827ec9421563d784dd4.8d26d4626541be6bc445cd2f75aaf976					2025	\N	\N	t	f	f	f	f	t
12	66	120990a1234ebe2287ae4c573c0cd265067ef0023e3f5661cde6637ce829fd7dd136122497226d8d9ea380fd37329059266a742ee1bf165c9fe1d71d3535cc37.928fd89612bafd3b0bfd568e931530c9					2025	\N	\N	t	f	f	f	f	t
\.


--
-- Name: checkins_id_seq; Type: SEQUENCE SET; Schema: public; Owner: neondb_owner
--

SELECT pg_catalog.setval('public.checkins_id_seq', 16, true);


--
-- Name: game_players_id_seq; Type: SEQUENCE SET; Schema: public; Owner: neondb_owner
--

SELECT pg_catalog.setval('public.game_players_id_seq', 8, true);


--
-- Name: game_sets_id_seq; Type: SEQUENCE SET; Schema: public; Owner: neondb_owner
--

SELECT pg_catalog.setval('public.game_sets_id_seq', 1, true);


--
-- Name: games_id_seq; Type: SEQUENCE SET; Schema: public; Owner: neondb_owner
--

SELECT pg_catalog.setval('public.games_id_seq', 1, true);


--
-- Name: users_id_seq; Type: SEQUENCE SET; Schema: public; Owner: neondb_owner
--

SELECT pg_catalog.setval('public.users_id_seq', 12, true);


--
-- Name: checkins checkins_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.checkins
    ADD CONSTRAINT checkins_pkey PRIMARY KEY (id);


--
-- Name: game_players game_players_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.game_players
    ADD CONSTRAINT game_players_pkey PRIMARY KEY (id);


--
-- Name: game_sets game_sets_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.game_sets
    ADD CONSTRAINT game_sets_pkey PRIMARY KEY (id);


--
-- Name: games games_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.games
    ADD CONSTRAINT games_pkey PRIMARY KEY (id);


--
-- Name: session session_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.session
    ADD CONSTRAINT session_pkey PRIMARY KEY (sid);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: users users_username_unique; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_username_unique UNIQUE (username);


--
-- Name: IDX_session_expire; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX "IDX_session_expire" ON public.session USING btree (expire);


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: public; Owner: cloud_admin
--

ALTER DEFAULT PRIVILEGES FOR ROLE cloud_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO neon_superuser WITH GRANT OPTION;


--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: public; Owner: cloud_admin
--

ALTER DEFAULT PRIVILEGES FOR ROLE cloud_admin IN SCHEMA public GRANT ALL ON TABLES TO neon_superuser WITH GRANT OPTION;


--
-- PostgreSQL database dump complete
--

