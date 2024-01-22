using DeGA.Core;
using DeGA.Generator.CSharp.Compilation;
using DeGA.Generator.CSharp.Generators;
using Microsoft.Extensions.DependencyInjection;

namespace DeGA.Generator.CSharp
{
    public static class ServiceCollectionExtensions
    {
        public static DeGAServiceBuilder AddCSharpGeneration(this DeGAServiceBuilder builder)
        {
            builder.Services.AddTransient<DotNetProjectFactory>();
            builder.Services.AddTransient<CodeGeneratorFactory>();
            builder.Services.AddTransient<DotNetProjectGenerator>();
            return builder;
        }
    }
}
