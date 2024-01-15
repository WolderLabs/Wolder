
using System;

class Program
{
    static void Main()
    {
        // loop through numbers from 1 to 100
        for (int i = 1; i <= 100; i++)
        {
            // check if the number is divisible by both 3 and 5
            if (i % 3 == 0 && i % 5 == 0)
            {
                Console.WriteLine("FizzBuzz");
            }
            // check if the number is divisible by 3
            else if (i % 3 == 0)
            {
                Console.WriteLine("Fizz");
            }
            // check if the number is divisible by 5
            else if (i % 5 == 0)
            {
                Console.WriteLine("Buzz");
            }
            // if the number is not divisible by 3 or 5, just print the number
            else
            {
                Console.WriteLine(i);
            }
        }
    }
}
