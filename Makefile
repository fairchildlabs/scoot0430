CC=gcc
CFLAGS=-Wall -Werror -g `pkg-config --cflags libpq`
LDFLAGS=`pkg-config --libs libpq`

all: scootd scootd_enhanced

scootd: scootd.c
	$(CC) $(CFLAGS) -o $@ $< $(LDFLAGS)

scootd_enhanced: scootd_enhanced.c
	$(CC) $(CFLAGS) -o $@ $< $(LDFLAGS)

clean:
	rm -f scootd scootd_enhanced

.PHONY: all clean
