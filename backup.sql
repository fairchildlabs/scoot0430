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
    game_set_id integer NOT NULL,
    queue_position integer NOT NULL,
    check_in_time timestamp without time zone NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    club_index integer DEFAULT 34 NOT NULL,
    check_in_date text NOT NULL,
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

COPY public.checkins (id, user_id, game_set_id, queue_position, check_in_time, is_active, club_index, check_in_date, game_id, type, team) FROM stdin;
\.


--
-- Data for Name: game_players; Type: TABLE DATA; Schema: public; Owner: neondb_owner
--

COPY public.game_players (id, game_id, user_id, team) FROM stdin;
\.


--
-- Data for Name: game_sets; Type: TABLE DATA; Schema: public; Owner: neondb_owner
--

COPY public.game_sets (id, created_at, created_by, players_per_team, gym, max_consecutive_team_wins, time_limit, win_score, point_system, is_active, number_of_courts, current_queue_position, queue_next_up) FROM stdin;
\.


--
-- Data for Name: games; Type: TABLE DATA; Schema: public; Owner: neondb_owner
--

COPY public.games (id, set_id, start_time, end_time, team1_score, team2_score, club_index, court, state) FROM stdin;
\.


--
-- Data for Name: users; Type: TABLE DATA; Schema: public; Owner: neondb_owner
--

COPY public.users (id, username, password, first_name, last_name, email, phone, birth_year, birth_month, birth_day, is_player, is_bank, is_book, is_engineer, is_root, autoup) FROM stdin;
\.


--
-- Name: checkins_id_seq; Type: SEQUENCE SET; Schema: public; Owner: neondb_owner
--

SELECT pg_catalog.setval('public.checkins_id_seq', 1, false);


--
-- Name: game_players_id_seq; Type: SEQUENCE SET; Schema: public; Owner: neondb_owner
--

SELECT pg_catalog.setval('public.game_players_id_seq', 1, false);


--
-- Name: game_sets_id_seq; Type: SEQUENCE SET; Schema: public; Owner: neondb_owner
--

SELECT pg_catalog.setval('public.game_sets_id_seq', 1, false);


--
-- Name: games_id_seq; Type: SEQUENCE SET; Schema: public; Owner: neondb_owner
--

SELECT pg_catalog.setval('public.games_id_seq', 1, false);


--
-- Name: users_id_seq; Type: SEQUENCE SET; Schema: public; Owner: neondb_owner
--

SELECT pg_catalog.setval('public.users_id_seq', 1, false);


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

