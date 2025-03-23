CC=gcc
CFLAGS=-Wall -Werror -g `pkg-config --cflags libpq`
LDFLAGS=`pkg-config --libs libpq`

all: scootd

scootd: scootd.c
	$(CC) $(CFLAGS) -o $@ $< $(LDFLAGS)

clean:
	rm -f scootd

.PHONY: all clean