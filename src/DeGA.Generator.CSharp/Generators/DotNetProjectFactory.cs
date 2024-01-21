using DeGA.Generator.CSharp.Compilation;
using Microsoft.Extensions.DependencyInjection;

namespace DeGA.Generator.CSharp.Generators
{
    public class DotNetProjectFactory(IServiceProvider services)
    {
        public DotNetProject Create(string path)
        {
            return ActivatorUtilities.CreateInstance<DotNetProject>(services, path);
        }
    }
}
