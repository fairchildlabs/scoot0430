CC=gcc
CFLAGS=-Wall -Werror -g `pkg-config --cflags libpq`
LDFLAGS=`pkg-config --libs libpq`

all: scootd scootd_enhanced scootd_integrated

scootd: scootd.c
	$(CC) $(CFLAGS) -o $@ $< $(LDFLAGS)

scootd_enhanced: scootd_enhanced_fixed.c
	$(CC) $(CFLAGS) -o $@ $< $(LDFLAGS)

scootd_integrated: scootd_integrated.c
	$(CC) $(CFLAGS) -o $@ $< $(LDFLAGS)

clean:
	rm -f scootd scootd_enhanced scootd_integrated

.PHONY: all clean
