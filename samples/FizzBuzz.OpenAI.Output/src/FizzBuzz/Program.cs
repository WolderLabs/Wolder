
using System;

// Class Program
class Program
{
    // Main method
    static void Main()
    {
        // Loop through numbers 1 to 100
        for (int i = 1; i <= 100; i++)
        {
            // Check if the number is divisible by 3 and 5
            if (i % 3 == 0 && i % 5 == 0)
            {
                Console.WriteLine("FizzBuzz");
            }
            // Check if the number is divisible by 3
            else if (i % 3 == 0)
            {
                Console.WriteLine("Fizz");
            }
            // Check if the number is divisible by 5
            else if (i % 5 == 0)
            {
                Console.WriteLine("Buzz");
            }
            // If none of the above conditions are met, print the number
            else
            {
                Console.WriteLine(i);
            }
        }
    }
}
