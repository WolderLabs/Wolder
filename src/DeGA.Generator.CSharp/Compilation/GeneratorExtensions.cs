
using DeGA.Core;

namespace DeGA.Generator.CSharp.Compilation
{
    public static class GeneratorExtensions
    {
        public static DotNetSolutionScope UseDotNetSolution(this GeneratorWorkspace generator, string solutionName)
        {
            return new DotNetSolutionScope();
        }
    }
}
