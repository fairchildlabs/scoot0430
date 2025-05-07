#include <stdio.h>
#include <string.h>

/**
 * Extract team designation from a checkin type
 * Checks if the checkin type ends with :H or :A and returns the designation
 * 
 * @param checkin_type The checkin type string to parse
 * @return 'H' for HOME team, 'A' for AWAY team, '\0' if no designation
 */
char get_team_designation(const char* checkin_type) {
    // Find the last ':' character in the type string
    const char *last_colon = strchr(checkin_type, ':');
    // Find the last colon by iterating through the string
    while(last_colon) {
        const char *next_colon = strchr(last_colon + 1, ':');
        if (!next_colon) break;
        last_colon = next_colon;
    }
    
    if (last_colon != NULL && (last_colon[1] == 'H' || last_colon[1] == 'A')) {
        return last_colon[1];
    }
    return '\0';
}

int main() {
    // Test cases for different checkin types
    const char* test_types[] = {
        "manual",
        "loss_promoted:2:A",
        "autoup:1:H",
        "win_promoted:3",
        "loss_promoted:1:A",
        "loss_promoted:2",
        ":H",
        "A:",
        "::H"
    };
    
    // Expected outputs for each test
    char expected[] = {
        '\0',  // manual - no designation
        'A',   // loss_promoted:2:A - AWAY
        'H',   // autoup:1:H - HOME
        '\0',  // win_promoted:3 - no designation
        'A',   // loss_promoted:1:A - AWAY
        '\0',  // loss_promoted:2 - no designation
        'H',   // :H - HOME
        '\0',  // A: - no valid designation 
        'H'    // ::H - HOME
    };
    
    int tests_passed = 0;
    int total_tests = sizeof(test_types) / sizeof(test_types[0]);
    
    printf("TEAM DESIGNATION FUNCTION TEST\n");
    printf("==============================\n\n");
    
    for (int i = 0; i < total_tests; i++) {
        char result = get_team_designation(test_types[i]);
        char expected_char = expected[i];
        
        printf("Test %d: Type='%s'\n", i+1, test_types[i]);
        printf("  Expected: %c, Got: %c\n", 
               expected_char == '\0' ? '-' : expected_char,
               result == '\0' ? '-' : result);
               
        if (result == expected_char) {
            printf("  ✓ PASS\n");
            tests_passed++;
        } else {
            printf("  ✗ FAIL\n");
        }
        printf("\n");
    }
    
    printf("Results: %d/%d tests passed\n", tests_passed, total_tests);
    
    return tests_passed == total_tests ? 0 : 1;
}